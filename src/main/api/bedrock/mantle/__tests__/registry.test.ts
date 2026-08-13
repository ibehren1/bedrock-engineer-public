import { describe, test, expect } from '@jest/globals'
import {
  allModels,
  getModelConfig,
  getModelsForRegion,
  usesResponsesApi
} from '../../../../../common/models/models'
import { PricingCalculator } from '../../../../../common/models/pricing'

const RESPONSES_MODELS = [
  { id: 'openai.gpt-5.6-sol', name: 'GPT-5.6 Sol' },
  { id: 'openai.gpt-5.6-terra', name: 'GPT-5.6 Terra' },
  { id: 'openai.gpt-5.6-luna', name: 'GPT-5.6 Luna' },
  { id: 'openai.gpt-5.5', name: 'GPT-5.5' },
  { id: 'openai.gpt-5.4', name: 'GPT-5.4' }
]

describe('OpenAI Responses model registry integration', () => {
  test.each(RESPONSES_MODELS)(
    '$id is registered as $name with tool use + thinking',
    ({ id, name }) => {
      const model = allModels.find((m) => m.modelId === id)
      expect(model).toBeDefined()
      expect(model?.modelName).toBe(name)
      expect(model?.toolUse).toBe(true)
      expect(model?.supportsThinking).toBe(true)
    }
  )

  test.each(RESPONSES_MODELS)('$id routes through the Responses API', ({ id }) => {
    expect(usesResponsesApi(id)).toBe(true)
  })

  test('Converse-path models are not routed to Responses', () => {
    expect(usesResponsesApi('global.anthropic.claude-sonnet-4-6')).toBe(false)
    // GPT-OSS models remain on the Converse path
    expect(usesResponsesApi('openai.gpt-oss-120b-1:0')).toBe(false)
    expect(usesResponsesApi('openai.gpt-oss-20b-1:0')).toBe(false)
  })

  test('region availability matches each model card', () => {
    // Sol + 5.5: us-east-1/us-east-2 only
    expect(getModelsForRegion('us-west-2').some((m) => m.modelId === 'openai.gpt-5.6-sol')).toBe(
      false
    )
    expect(getModelsForRegion('us-west-2').some((m) => m.modelId === 'openai.gpt-5.5')).toBe(false)
    // Terra, Luna, 5.4: also us-west-2
    expect(getModelsForRegion('us-west-2').some((m) => m.modelId === 'openai.gpt-5.6-terra')).toBe(
      true
    )
    expect(getModelsForRegion('us-west-2').some((m) => m.modelId === 'openai.gpt-5.6-luna')).toBe(
      true
    )
    expect(getModelsForRegion('us-west-2').some((m) => m.modelId === 'openai.gpt-5.4')).toBe(true)
    // all five in us-east-1
    for (const { id } of RESPONSES_MODELS) {
      expect(getModelsForRegion('us-east-1').some((m) => m.modelId === id)).toBe(true)
    }
  })

  test('getModelConfig resolves each id to its own config (no cross-matching)', () => {
    for (const { id, name } of RESPONSES_MODELS) {
      expect(getModelConfig(id)?.name).toBe(name)
    }
  })

  test('every Responses model has pricing wired', () => {
    for (const { id } of RESPONSES_MODELS) {
      const pricing = getModelConfig(id)?.pricing
      expect(pricing).toBeDefined()
      expect(pricing!.input).toBeGreaterThan(0)
      expect(pricing!.output).toBeGreaterThan(0)
    }
  })

  test('pricing calculator uses per-1K rates (GPT-5.6 Sol: $5.50/$33 per 1M)', () => {
    const calc = new PricingCalculator('openai.gpt-5.6-sol')
    // 1M input tokens = $5.50, 1M output tokens = $33.00
    expect(calc.calculateInputCost(1_000_000)).toBeCloseTo(5.5, 5)
    expect(calc.calculateOutputCost(1_000_000)).toBeCloseTo(33.0, 5)
  })
})
