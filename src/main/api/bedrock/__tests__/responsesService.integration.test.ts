import { describe, test, beforeAll, expect } from '@jest/globals'
import { BedrockService } from '../index'
import type { ServiceContext } from '../types'
import type { ConverseStreamOutput, Message } from '@aws-sdk/client-bedrock-runtime'

/**
 * Live validation of the OpenAI GPT-5.5 Responses path on the bedrock-mantle
 * endpoint. Skipped unless INTEGRATION_TEST=true and AWS credentials with
 * Bedrock (mantle) access are configured.
 *
 * Requirements to run:
 *   INTEGRATION_TEST=true
 *   AWS_REGION=us-east-2 (or us-east-1) — GPT-5.5 is in-region only
 *   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (or a configured profile) with
 *     bedrock-mantle:CallWithBearerToken permission and GPT-5.5 model access.
 *
 * These tests intentionally exercise the real token generation + endpoint so we
 * can confirm the one thing unit tests cannot: that a `bedrock`-signed
 * short-term token is accepted by the bedrock-mantle endpoint and that the
 * Responses<->Converse translation round-trips against the live API.
 */
const INTEGRATION_TEST = process.env.INTEGRATION_TEST === 'true'
const MODEL_ID = 'openai.gpt-5.5'

function createMockStore(initialState: Record<string, any> = {}): ServiceContext['store'] {
  const store = {
    state: { ...initialState },
    get(key: string) {
      if (key === 'aws') {
        return {
          region: process.env.AWS_REGION || 'us-east-2',
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          sessionToken: process.env.AWS_SESSION_TOKEN
        }
      }
      if (key === 'inferenceParams') {
        return { maxTokens: 1024, temperature: 0.7, topP: 0.9 }
      }
      if (key === 'thinkingMode') {
        return { type: 'disabled' }
      }
      return this.state[key]
    },
    set(key: string, value: any) {
      this.state[key] = value
    }
  }
  return store as unknown as ServiceContext['store']
}

;(INTEGRATION_TEST ? describe : describe.skip)('GPT-5.5 Responses Integration', () => {
  let bedrock: BedrockService

  beforeAll(() => {
    bedrock = new BedrockService({ store: createMockStore() })
  })

  test('non-streaming converse returns assistant text', async () => {
    const messages: Message[] = [
      { role: 'user', content: [{ text: 'Reply with the single word: pong' }] }
    ]
    const result = await bedrock.converse({ modelId: MODEL_ID, messages, system: [] })
    const text = result.output?.message?.content?.map((c) => c.text).join('') ?? ''
    expect(text.toLowerCase()).toContain('pong')
    expect(result.usage?.inputTokens).toBeGreaterThan(0)
  }, 60000)

  test('streaming converse yields text deltas and a stop', async () => {
    const messages: Message[] = [{ role: 'user', content: [{ text: 'Count from 1 to 3.' }] }]
    const result = await bedrock.converseStream({ modelId: MODEL_ID, messages, system: [] })
    expect(result.stream).toBeDefined()

    let text = ''
    let sawStart = false
    let stopReason: string | undefined
    for await (const event of result.stream as AsyncIterable<ConverseStreamOutput>) {
      if ('messageStart' in event) sawStart = true
      if ('contentBlockDelta' in event) text += event.contentBlockDelta?.delta?.text ?? ''
      if ('messageStop' in event) stopReason = event.messageStop?.stopReason
    }
    expect(sawStart).toBe(true)
    expect(text.length).toBeGreaterThan(0)
    expect(stopReason).toBeDefined()
  }, 60000)

  test('streaming tool use produces a toolUse block and tool_use stop', async () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [{ text: 'What is the weather in Paris? Use the get_weather tool.' }]
      }
    ]
    const toolConfig = {
      tools: [
        {
          toolSpec: {
            name: 'get_weather',
            description: 'Get the current weather for a city',
            inputSchema: {
              json: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city']
              }
            }
          }
        }
      ]
    }
    const result = await bedrock.converseStream({
      modelId: MODEL_ID,
      messages,
      system: [],
      toolConfig
    })

    let toolName: string | undefined
    let toolInput = ''
    let stopReason: string | undefined
    for await (const event of result.stream as AsyncIterable<ConverseStreamOutput>) {
      if ('contentBlockStart' in event && event.contentBlockStart?.start?.toolUse) {
        toolName = event.contentBlockStart.start.toolUse.name
      }
      if ('contentBlockDelta' in event && event.contentBlockDelta?.delta?.toolUse) {
        toolInput += event.contentBlockDelta.delta.toolUse.input ?? ''
      }
      if ('messageStop' in event) stopReason = event.messageStop?.stopReason
    }
    expect(toolName).toBe('get_weather')
    expect(stopReason).toBe('tool_use')
    expect(() => JSON.parse(toolInput)).not.toThrow()
  }, 60000)
})
