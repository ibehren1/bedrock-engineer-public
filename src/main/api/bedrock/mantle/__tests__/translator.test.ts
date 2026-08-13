import { describe, test, expect } from '@jest/globals'
import type {
  Message,
  SystemContentBlock,
  ToolConfiguration
} from '@aws-sdk/client-bedrock-runtime'
import {
  buildResponsesRequest,
  createStreamState,
  mapStopReason,
  mapThinkingToEffort,
  messagesToResponsesInput,
  systemToInstructions,
  toolConfigToResponsesTools,
  translateResponse,
  translateStreamEvent,
  type ResponsesStreamEvent
} from '../translator'

describe('mantle translator — request mapping', () => {
  test('maps user text message to input_text', () => {
    const messages: Message[] = [{ role: 'user', content: [{ text: 'hello' }] }]
    expect(messagesToResponsesInput(messages)).toEqual([
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] }
    ])
  })

  test('maps assistant text to output_text', () => {
    const messages: Message[] = [{ role: 'assistant', content: [{ text: 'hi there' }] }]
    expect(messagesToResponsesInput(messages)).toEqual([
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'hi there' }] }
    ])
  })

  test('maps assistant toolUse to a function_call item with call_id = toolUseId', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [
          { text: 'let me check' },
          { toolUse: { toolUseId: 'tool_123', name: 'readFile', input: { path: '/a' } } }
        ]
      }
    ]
    const items = messagesToResponsesInput(messages)
    expect(items).toEqual([
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'let me check' }]
      },
      { type: 'function_call', call_id: 'tool_123', name: 'readFile', arguments: '{"path":"/a"}' }
    ])
  })

  test('maps user toolResult to function_call_output linked by call_id', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          {
            toolResult: {
              toolUseId: 'tool_123',
              content: [{ json: { ok: true } }],
              status: 'success'
            }
          }
        ]
      }
    ]
    expect(messagesToResponsesInput(messages)).toEqual([
      { type: 'function_call_output', call_id: 'tool_123', output: '{"ok":true}' }
    ])
  })

  test('tool call_id round-trips: toolUse -> function_call -> function_call_output', () => {
    const messages: Message[] = [
      { role: 'assistant', content: [{ toolUse: { toolUseId: 'abc', name: 'f', input: {} } }] },
      {
        role: 'user',
        content: [
          { toolResult: { toolUseId: 'abc', content: [{ text: 'done' }], status: 'success' } }
        ]
      }
    ]
    const items = messagesToResponsesInput(messages)
    const call = items.find((i) => i.type === 'function_call') as any
    const output = items.find((i) => i.type === 'function_call_output') as any
    expect(call.call_id).toBe('abc')
    expect(output.call_id).toBe('abc')
  })

  test('drops reasoningContent blocks from history (not round-trippable)', () => {
    const messages: Message[] = [
      {
        role: 'assistant',
        content: [
          { reasoningContent: { reasoningText: { text: 'thinking...', signature: 'sig' } } },
          { text: 'answer' }
        ]
      }
    ]
    expect(messagesToResponsesInput(messages)).toEqual([
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'answer' }] }
    ])
  })

  test('systemToInstructions joins multiple system blocks', () => {
    const system: SystemContentBlock[] = [{ text: 'a' }, { text: 'b' }]
    expect(systemToInstructions(system)).toBe('a\n\nb')
    expect(systemToInstructions([])).toBeUndefined()
    expect(systemToInstructions(undefined)).toBeUndefined()
  })

  test('toolConfigToResponsesTools maps toolSpec.inputSchema.json to parameters', () => {
    const toolConfig: ToolConfiguration = {
      tools: [
        {
          toolSpec: {
            name: 'readFile',
            description: 'Read a file',
            inputSchema: { json: { type: 'object', properties: { path: { type: 'string' } } } }
          }
        }
      ]
    }
    expect(toolConfigToResponsesTools(toolConfig)).toEqual([
      {
        type: 'function',
        name: 'readFile',
        description: 'Read a file',
        parameters: { type: 'object', properties: { path: { type: 'string' } } },
        strict: false
      }
    ])
  })

  test('toolConfigToResponsesTools returns undefined for empty tools', () => {
    expect(toolConfigToResponsesTools(undefined)).toBeUndefined()
    expect(toolConfigToResponsesTools({ tools: [] })).toBeUndefined()
  })

  test('mapThinkingToEffort maps budget tokens to effort levels', () => {
    expect(mapThinkingToEffort(undefined)).toBeUndefined()
    expect(mapThinkingToEffort({ type: 'disabled' })).toBeUndefined()
    expect(mapThinkingToEffort({ type: 'enabled', budget_tokens: 1024 as any })).toBe('low')
    expect(mapThinkingToEffort({ type: 'enabled', budget_tokens: 4096 as any })).toBe('medium')
    expect(mapThinkingToEffort({ type: 'enabled', budget_tokens: 16384 as any })).toBe('high')
  })

  test('buildResponsesRequest assembles a complete request with store:false', () => {
    const req = buildResponsesRequest({
      modelId: 'openai.gpt-5.5',
      messages: [{ role: 'user', content: [{ text: 'hi' }] }],
      system: [{ text: 'be helpful' }],
      inferenceConfig: { maxTokens: 2048, temperature: 0.7, topP: 0.9 }
    })
    expect(req.model).toBe('openai.gpt-5.5')
    expect(req.store).toBe(false)
    expect(req.instructions).toBe('be helpful')
    expect(req.max_output_tokens).toBe(2048)
    // GPT-5.5 is a reasoning model: never send sampling params, always reasoning.
    // With no explicit thinking budget we default to 'medium' effort.
    expect(req.temperature).toBeUndefined()
    expect(req.top_p).toBeUndefined()
    expect(req.reasoning).toEqual({ effort: 'medium' })
  })

  test('buildResponsesRequest with thinking sets reasoning.effort and drops sampling params', () => {
    const req = buildResponsesRequest({
      modelId: 'openai.gpt-5.5',
      messages: [{ role: 'user', content: [{ text: 'hi' }] }],
      inferenceConfig: { maxTokens: 2048, temperature: 0.7, topP: 0.9 },
      thinkingMode: { type: 'enabled', budget_tokens: 16384 as any }
    })
    expect(req.reasoning).toEqual({ effort: 'high' })
    expect(req.temperature).toBeUndefined()
    expect(req.top_p).toBeUndefined()
  })

  test('buildResponsesRequest honors disableThinking (no reasoning, no sampling params)', () => {
    const req = buildResponsesRequest({
      modelId: 'openai.gpt-5.5',
      messages: [{ role: 'user', content: [{ text: 'hi' }] }],
      inferenceConfig: { maxTokens: 2048, temperature: 0.7, topP: 0.9 },
      thinkingMode: { type: 'enabled', budget_tokens: 16384 as any },
      disableThinking: true
    })
    expect(req.reasoning).toBeUndefined()
    expect(req.temperature).toBeUndefined()
    expect(req.top_p).toBeUndefined()
  })
})

describe('mantle translator — streaming translation', () => {
  function run(events: ResponsesStreamEvent[]) {
    const state = createStreamState()
    const out: any[] = []
    for (const e of events) {
      for (const t of translateStreamEvent(e, state)) out.push(t)
    }
    return { out, state }
  }

  test('emits messageStart once on response.created', () => {
    const { out } = run([
      { type: 'response.created' },
      { type: 'response.in_progress' } // should NOT emit a second messageStart
    ])
    const starts = out.filter((o) => o.messageStart)
    expect(starts).toHaveLength(1)
    expect(starts[0].messageStart.role).toBe('assistant')
  })

  test('translates a text turn end-to-end', () => {
    const { out } = run([
      { type: 'response.created' },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message' } },
      { type: 'response.output_text.delta', output_index: 0, delta: 'Hello' },
      { type: 'response.output_text.delta', output_index: 0, delta: ' world' },
      { type: 'response.output_item.done', output_index: 0 },
      {
        type: 'response.completed',
        response: {
          status: 'completed',
          usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
        }
      }
    ])
    // contentBlockStart with no toolUse
    expect(out[1].contentBlockStart).toEqual({ start: undefined, contentBlockIndex: 0 })
    // two text deltas
    const deltas = out.filter((o) => o.contentBlockDelta?.delta?.text)
    expect(deltas.map((d) => d.contentBlockDelta.delta.text)).toEqual(['Hello', ' world'])
    // stop + metadata
    const stop = out.find((o) => o.messageStop)
    expect(stop.messageStop.stopReason).toBe('end_turn')
    const meta = out.find((o) => o.metadata)
    expect(meta.metadata.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 })
  })

  test('translates a tool call: function_call item -> contentBlockStart{toolUse} + arg deltas + stop', () => {
    const { out, state } = run([
      { type: 'response.created' },
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'function_call', call_id: 'call_1', name: 'readFile' }
      },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: '{"path"' },
      { type: 'response.function_call_arguments.delta', output_index: 0, delta: ':"/a"}' },
      { type: 'response.output_item.done', output_index: 0 },
      {
        type: 'response.completed',
        response: { status: 'completed', output: [{ type: 'function_call' }] }
      }
    ])
    const start = out.find((o) => o.contentBlockStart?.start?.toolUse)
    expect(start.contentBlockStart.start.toolUse).toEqual({ toolUseId: 'call_1', name: 'readFile' })
    const argDeltas = out.filter((o) => o.contentBlockDelta?.delta?.toolUse)
    expect(argDeltas.map((d) => d.contentBlockDelta.delta.toolUse.input).join('')).toBe(
      '{"path":"/a"}'
    )
    expect(state.sawToolCall).toBe(true)
    const stop = out.find((o) => o.messageStop)
    expect(stop.messageStop.stopReason).toBe('tool_use')
  })

  test('reasoning deltas map to reasoningContent', () => {
    const { out } = run([
      { type: 'response.created' },
      { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning' } },
      { type: 'response.reasoning_summary_text.delta', output_index: 0, delta: 'pondering' }
    ])
    const r = out.find((o) => o.contentBlockDelta?.delta?.reasoningContent)
    expect(r.contentBlockDelta.delta.reasoningContent.text).toBe('pondering')
  })

  test('response.failed throws with the error message', () => {
    const state = createStreamState()
    expect(() =>
      translateStreamEvent(
        { type: 'response.failed', response: { error: { message: 'boom' } } as any },
        state
      )
    ).toThrow('boom')
  })
})

describe('mantle translator — stop reason mapping', () => {
  test('tool_use when a function_call is present', () => {
    expect(mapStopReason({ output: [{ type: 'function_call' }] }, false)).toBe('tool_use')
    expect(mapStopReason({}, true)).toBe('tool_use')
  })

  test('max_tokens on incomplete/max_output_tokens', () => {
    expect(
      mapStopReason(
        { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
        false
      )
    ).toBe('max_tokens')
  })

  test('content_filtered on incomplete/content_filter', () => {
    expect(
      mapStopReason(
        { status: 'incomplete', incomplete_details: { reason: 'content_filter' } },
        false
      )
    ).toBe('content_filtered')
  })

  test('end_turn otherwise', () => {
    expect(mapStopReason({ status: 'completed' }, false)).toBe('end_turn')
  })
})

describe('mantle translator — non-streaming response', () => {
  test('translates a text response', () => {
    const result = translateResponse({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'hi' }] }],
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 }
    })
    expect(result.output.message.content).toEqual([{ text: 'hi' }])
    expect(result.stopReason).toBe('end_turn')
    expect(result.usage).toEqual({ inputTokens: 3, outputTokens: 2, totalTokens: 5 })
  })

  test('translates a function_call response into a toolUse block with parsed input', () => {
    const result = translateResponse({
      status: 'completed',
      output: [{ type: 'function_call', call_id: 'c1', name: 'f', arguments: '{"x":1}' }]
    })
    expect(result.output.message.content).toEqual([
      { toolUse: { toolUseId: 'c1', name: 'f', input: { x: 1 } } }
    ])
    expect(result.stopReason).toBe('tool_use')
  })

  test('malformed function_call arguments fall back to empty object', () => {
    const result = translateResponse({
      output: [{ type: 'function_call', call_id: 'c1', name: 'f', arguments: 'not json' }]
    })
    expect((result.output.message.content[0] as any).toolUse.input).toEqual({})
  })

  test('empty output yields a single empty text block', () => {
    const result = translateResponse({ output: [] })
    expect(result.output.message.content).toEqual([{ text: '' }])
  })
})
