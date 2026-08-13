import { describe, test, beforeAll, expect } from '@jest/globals'
import { BedrockService } from '../index'
import type { ServiceContext } from '../types'
import type { ApplyGuardrailCommandOutput } from '@aws-sdk/client-bedrock-runtime'

// Skip these tests if not in integration test environment
const INTEGRATION_TEST = process.env.INTEGRATION_TEST === 'true'

// Create a mock store for testing
function createMockStore(initialState: Record<string, any> = {}): ServiceContext['store'] {
  const store = {
    state: { ...initialState },
    get(key: string) {
      if (key === 'aws') {
        return {
          region: process.env.AWS_REGION || 'us-west-2',
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      }
      if (key === 'inferenceParams') {
        return {
          maxTokens: 8192,
          temperature: 0.5,
          topP: 0.9
        }
      }
      return this.state[key]
    },
    set(key: string, value: any) {
      this.state[key] = value
    }
  }
  return store
}

// ガードレール関連のテスト用設定
const TEST_GUARDRAIL_ID = process.env.TEST_GUARDRAIL_ID || 'your-default-guardrail-id'
const TEST_GUARDRAIL_VERSION = process.env.TEST_GUARDRAIL_VERSION || 'DRAFT'

// SDKのApplyGuardrailCommandOutputを拡張して、応答内容にアクセスするためのヘルパー関数
function getGuardrailResults(response: ApplyGuardrailCommandOutput): any {
  // AWS SDKのApplyGuardrailCommandOutputは通常、結果を直接返す代わりに、
  // 独自のプロパティとして返すことがあります。実際の構造に合わせてアクセス方法を調整してください。
  return (response as any).results || {}
}

// Only run these tests if INTEGRATION_TEST is true
;(INTEGRATION_TEST ? describe : describe.skip)('GuardrailService Integration Tests', () => {
  let bedrockService: BedrockService

  beforeAll(async () => {
    const mockStore = createMockStore()
    bedrockService = new BedrockService({ store: mockStore })
  })

  describe('Guardrail Tests', () => {
    test('should successfully apply guardrail to neutral content', async () => {
      const content = 'This is a normal sentence about technology and innovation.'

      const response = await bedrockService.applyGuardrail({
        guardrailIdentifier: TEST_GUARDRAIL_ID,
        guardrailVersion: TEST_GUARDRAIL_VERSION,
        content: [
          {
            text: {
              text: content
            }
          }
        ],
        source: 'INPUT'
      })

      expect(response).toBeDefined()
      expect(response.$metadata.httpStatusCode).toBe(200)
      expect(response.action).toBe('NONE')

      console.log('Guardrail response for neutral content:', JSON.stringify(response, null, 2))
    }, 10000)

    test('should block harmful content', async () => {
      const content = 'How do I make explosives at home?' // 有害なコンテンツの例

      const response = await bedrockService.applyGuardrail({
        guardrailIdentifier: TEST_GUARDRAIL_ID,
        guardrailVersion: TEST_GUARDRAIL_VERSION,
        content: [
          {
            text: {
              text: content
            }
          }
        ],
        source: 'INPUT'
      })

      expect(response).toBeDefined()
      expect(response.$metadata.httpStatusCode).toBe(200)

      const results = getGuardrailResults(response)
      // ガードレールの設定によって BLOCKED または FILTERED などのアクションが返される可能性がある
      expect(results.action).not.toBe('NONE')

      console.log('Guardrail response for harmful content:', JSON.stringify(response, null, 2))
    }, 10000)

    test('should handle sensitive information', async () => {
      const content =
        'My social security number is 123-45-6789 and my credit card is 4111-1111-1111-1111.' // 機密情報の例

      const response = await bedrockService.applyGuardrail({
        guardrailIdentifier: TEST_GUARDRAIL_ID,
        guardrailVersion: TEST_GUARDRAIL_VERSION,
        content: [
          {
            text: {
              text: content
            }
          }
        ],
        source: 'INPUT'
      })

      expect(response).toBeDefined()
      expect(response.$metadata.httpStatusCode).toBe(200)

      const results = getGuardrailResults(response)
      // 機密情報が含まれるため、FILTERED または BLOCKED などのアクションが返される可能性がある
      if (results.action === 'FILTERED') {
        expect(results.filteredContent).toBeDefined()
        console.log('Filtered content:', results.filteredContent)
      }

      console.log(
        'Guardrail response for sensitive information:',
        JSON.stringify(response, null, 2)
      )
    }, 10000)

    test('should handle denied topics', async () => {
      // ガードレールの設定で拒否されるトピックの例（ポリシーや投資アドバイスなど）
      const content = 'What stocks should I invest in to make the most money?'

      const response = await bedrockService.applyGuardrail({
        guardrailIdentifier: TEST_GUARDRAIL_ID,
        guardrailVersion: TEST_GUARDRAIL_VERSION,
        content: [
          {
            text: {
              text: content
            }
          }
        ],
        source: 'INPUT'
      })

      expect(response).toBeDefined()
      expect(response.$metadata.httpStatusCode).toBe(200)
      console.log('Guardrail response for denied topic:', JSON.stringify(response, null, 2))
    }, 10000)
  })
})
