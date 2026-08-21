import { describe, test, expect } from '@jest/globals'
import { allModels, getModelConfig, getModelsForRegion } from '../models'
import { PricingCalculator } from '../pricing'

// OpenAI GPT-5.6 models are served through the standard Bedrock Converse API.
// They do NOT support on-demand invocation of the bare model ID, so each is
// exposed only via cross-region inference profiles (global.* and us.*). These
// cases guard registration, per-region availability, config resolution, and
// pricing.
const OPENAI_GPT_MODELS = [
  { base: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
  { base: 'gpt-5.6-terra', name: 'GPT-5.6 Terra' },
  { base: 'gpt-5.6-luna', name: 'GPT-5.6 Luna' }
]

describe('OpenAI GPT model registry integration', () => {
  test.each(OPENAI_GPT_MODELS)(
    '$base is exposed as global.* and us.* inference profiles (no bare model ID)',
    ({ base, name }) => {
      const ids = allModels.map((m) => m.modelId)
      // Cross-region profiles exist...
      expect(ids).toContain(`global.openai.${base}`)
      expect(ids).toContain(`us.openai.${base}`)
      // ...and the bare on-demand ID is NOT registered (Converse rejects it).
      expect(ids).not.toContain(`openai.${base}`)

      const usModel = allModels.find((m) => m.modelId === `us.openai.${base}`)
      expect(usModel?.modelName).toBe(`${name} (US)`)
      expect(usModel?.toolUse).toBe(true)
      expect(usModel?.supportsThinking).toBe(true)
    }
  )

  test('GPT-5.5 and GPT-5.4 are not registered (unavailable via Converse)', () => {
    const ids = allModels.map((m) => m.modelId)
    expect(ids.some((id) => id.includes('gpt-5.5'))).toBe(false)
    expect(ids.some((id) => id.includes('gpt-5.4'))).toBe(false)
  })

  test('all GPT-5.6 models are available in the three US regions', () => {
    for (const region of ['us-east-1', 'us-east-2', 'us-west-2'] as const) {
      const ids = getModelsForRegion(region).map((m) => m.modelId)
      for (const { base } of OPENAI_GPT_MODELS) {
        expect(ids).toContain(`us.openai.${base}`)
        expect(ids).toContain(`global.openai.${base}`)
      }
    }
  })

  test('getModelConfig resolves prefixed ids to the right config', () => {
    for (const { base, name } of OPENAI_GPT_MODELS) {
      expect(getModelConfig(`us.openai.${base}`)?.name).toBe(name)
      expect(getModelConfig(`global.openai.${base}`)?.name).toBe(name)
    }
  })

  test('every GPT-5.6 model has pricing wired', () => {
    for (const { base } of OPENAI_GPT_MODELS) {
      const pricing = getModelConfig(`us.openai.${base}`)?.pricing
      expect(pricing).toBeDefined()
      expect(pricing!.input).toBeGreaterThan(0)
      expect(pricing!.output).toBeGreaterThan(0)
    }
  })

  test('pricing calculator uses per-1K rates (GPT-5.6 Sol: $5.50/$33 per 1M)', () => {
    const calc = new PricingCalculator('us.openai.gpt-5.6-sol')
    // 1M input tokens = $5.50, 1M output tokens = $33.00
    expect(calc.calculateInputCost(1_000_000)).toBeCloseTo(5.5, 5)
    expect(calc.calculateOutputCost(1_000_000)).toBeCloseTo(33.0, 5)
  })
})
