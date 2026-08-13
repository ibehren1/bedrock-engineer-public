import { describe, test, beforeAll, expect } from '@jest/globals'
import { BedrockService } from '../index'
import type { ServiceContext } from '../types'

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

// Flow関連のテスト用設定
// 環境変数から取得するか、デフォルト値を使用
const TEST_FLOW_ID = process.env.TEST_FLOW_ID || 'test-flow-id'
const TEST_FLOW_ALIAS_ID = process.env.TEST_FLOW_ALIAS_ID || 'test-flow-alias-id'

// Only run these tests if INTEGRATION_TEST is true
;(INTEGRATION_TEST ? describe : describe.skip)('FlowService Integration Tests', () => {
  let bedrockService: BedrockService

  beforeAll(async () => {
    const mockStore = createMockStore()
    bedrockService = new BedrockService({ store: mockStore })
  })

  describe('Flow Tests', () => {
    test('should successfully invoke flow with basic input', async () => {
      const inputs = [
        {
          content: {
            document: 'Search about Amazon Bedrock'
          },
          nodeName: 'FlowInputNode',
          nodeOutputName: 'document'
        }
      ]

      const response = await bedrockService.invokeFlow({
        flowIdentifier: TEST_FLOW_ID,
        flowAliasIdentifier: TEST_FLOW_ALIAS_ID,
        inputs,
        enableTrace: true
      })

      expect(response).toBeDefined()
      expect(response.executionId).toBeDefined()
      expect(response.$metadata.httpStatusCode).toBe(200)

      console.log({
        executionId: response.executionId,
        flowStatus: response.flowStatus,
        outputsCount: response.outputs.length
      })

      // 出力内容の確認（存在するかどうか）
      if (response.outputs.length > 0) {
        console.log({
          firstOutput: {
            nodeName: response.outputs[0].nodeName,
            content: response.outputs[0].content.document.substring(0, 100) + '...'
          }
        })
      }
    }, 30000)

    test('should handle invalid flow ID with appropriate error', async () => {
      const invalidFlowId = 'invalid-flow-id'
      const inputs = [
        {
          content: {
            document: 'Hello'
          },
          nodeName: 'FlowInputNode',
          nodeOutputName: 'document'
        }
      ]

      await expect(
        bedrockService.invokeFlow({
          flowIdentifier: invalidFlowId,
          flowAliasIdentifier: TEST_FLOW_ALIAS_ID,
          inputs,
          enableTrace: true
        })
      ).rejects.toThrow()
    }, 30000)
  })
})
