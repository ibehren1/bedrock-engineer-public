import { describe, test, expect } from '@jest/globals'
import {
  allModels,
  clampMaxTokensToModelLimit,
  getModelConfig,
  getModelsForRegion
} from '../models'
import { PricingCalculator } from '../pricing'

// OpenAI GPT-6 and GPT-5.6 models are served through the standard Bedrock
// Converse API. They do NOT support on-demand invocation of the bare model ID,
// so each is exposed only via cross-region inference profiles (global.* and
// us.*). These cases guard registration, per-region availability, config
// resolution, and pricing.
const OPENAI_GPT_MODELS = [
  { base: 'gpt-6-astra', name: 'GPT-6 Astra' },
  { base: 'gpt-6-sol', name: 'GPT-6 Sol' },
  { base: 'gpt-6-luna', name: 'GPT-6 Luna' },
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

  test('all OpenAI GPT models are available in the three US regions', () => {
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

  test('every OpenAI GPT model has pricing wired', () => {
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

  test('pricing calculator uses per-1K rates (GPT-6 Astra: $11/$55 per 1M)', () => {
    const calc = new PricingCalculator('us.openai.gpt-6-astra')
    // Short Context Window (272K) Geo CRIS rate: 1M input = $11.00, 1M output = $55.00
    expect(calc.calculateInputCost(1_000_000)).toBeCloseTo(11.0, 5)
    expect(calc.calculateOutputCost(1_000_000)).toBeCloseTo(55.0, 5)
  })

  test('pricing calculator uses per-1K rates (GPT-6 Sol: $2/$10 per 1M)', () => {
    const calc = new PricingCalculator('us.openai.gpt-6-sol')
    expect(calc.calculateInputCost(1_000_000)).toBeCloseTo(2.0, 5)
    expect(calc.calculateOutputCost(1_000_000)).toBeCloseTo(10.0, 5)
  })

  test('pricing calculator uses per-1K rates (GPT-6 Luna: $0.10/$0.50 per 1M)', () => {
    const calc = new PricingCalculator('us.openai.gpt-6-luna')
    expect(calc.calculateInputCost(1_000_000)).toBeCloseTo(0.1, 5)
    expect(calc.calculateOutputCost(1_000_000)).toBeCloseTo(0.5, 5)
  })

  // The GPT-6 and GPT-5.6 tiers share suffixes (`sol`, `luna`), so config
  // resolution must not cross them over — GPT-5.6 Sol costs 2.75x GPT-6 Sol.
  test('GPT-6 and GPT-5.6 tiers with shared suffixes resolve distinctly', () => {
    expect(getModelConfig('us.openai.gpt-6-sol')?.name).toBe('GPT-6 Sol')
    expect(getModelConfig('us.openai.gpt-5.6-sol')?.name).toBe('GPT-5.6 Sol')
    expect(getModelConfig('us.openai.gpt-6-luna')?.name).toBe('GPT-6 Luna')
    expect(getModelConfig('us.openai.gpt-5.6-luna')?.name).toBe('GPT-5.6 Luna')
    expect(getModelConfig('us.openai.gpt-6-sol')?.pricing?.input).toBe(0.002)
    expect(getModelConfig('us.openai.gpt-6-luna')?.pricing?.input).toBe(0.0001)
  })

  test('GPT-6 Astra allows 128K max output tokens', () => {
    expect(getModelConfig('us.openai.gpt-6-astra')?.maxTokensLimit).toBe(128000)
  })
})

// Claude Opus 5.5 uses an unsuffixed base ID (`anthropic.claude-opus-5-5`) that
// contains Opus 5's base ID, so config resolution has to prefer the longest
// match. Bedrock offers no in-region invocation, only global + US/EU/JP geos.
describe('Claude Opus 5.5 registry integration', () => {
  test('is exposed as global/US/EU/JP profiles and no bare model ID', () => {
    const ids = allModels.map((m) => m.modelId)
    expect(ids).toContain('global.anthropic.claude-opus-5-5')
    expect(ids).toContain('us.anthropic.claude-opus-5-5')
    expect(ids).toContain('eu.anthropic.claude-opus-5-5')
    expect(ids).toContain('jp.anthropic.claude-opus-5-5')
    expect(ids).not.toContain('anthropic.claude-opus-5-5')
  })

  test('display names carry the routing suffix and capabilities are set', () => {
    const usModel = allModels.find((m) => m.modelId === 'us.anthropic.claude-opus-5-5')
    expect(usModel?.modelName).toBe('Claude Opus 5.5 (US)')
    expect(usModel?.toolUse).toBe(true)
    expect(usModel?.supportsThinking).toBe(true)
    expect(usModel?.supportedThinkingTypes).toEqual(['adaptive'])
    expect(usModel?.maxTokensLimit).toBe(128000)
  })

  test('pricing uses per-1K rates ($4/$20 per 1M, cache read a tenth of input)', () => {
    const calc = new PricingCalculator('us.anthropic.claude-opus-5-5')
    expect(calc.calculateInputCost(1_000_000)).toBeCloseTo(4.0, 5)
    expect(calc.calculateOutputCost(1_000_000)).toBeCloseTo(20.0, 5)
    expect(calc.calculateCacheReadCost(1_000_000)).toBeCloseTo(0.4, 5)
  })

  test('prompt caching is declared on messages, system and tools', () => {
    const cache = getModelConfig('us.anthropic.claude-opus-5-5')?.cache
    expect(cache?.supported).toBe(true)
    expect(cache?.cacheableFields).toEqual(['messages', 'system', 'tools'])
  })

  // A base ID that is a prefix of another must not swallow the longer model.
  test('config resolution does not confuse Opus 5.5 with Opus 5', () => {
    expect(getModelConfig('us.anthropic.claude-opus-5-5')?.name).toBe('Claude Opus 5.5')
    expect(getModelConfig('global.anthropic.claude-opus-5-5')?.name).toBe('Claude Opus 5.5')
    expect(getModelConfig('us.anthropic.claude-opus-5')?.name).toBe('Claude Opus 5')
    // Same shape one generation earlier: Fable 5 vs Fable 5.1.
    expect(getModelConfig('us.anthropic.claude-fable-5-1')?.name).toBe('Claude Fable 5.1')
    expect(getModelConfig('global.anthropic.claude-fable-5')?.name).toBe('Claude Fable 5')
  })
})

// xAI Grok 4.6 is served through the standard Bedrock Converse API, but only via
// cross-region inference profiles (global.* and us.*) — in-region invocation of
// the bare model ID is not supported on bedrock-runtime. Grok 4.3 is Mantle-only
// (no Converse), so it must not appear at all.
describe('xAI Grok model registry integration', () => {
  test('grok-4.6 is exposed as global.* and us.* inference profiles (no bare model ID)', () => {
    const ids = allModels.map((m) => m.modelId)
    expect(ids).toContain('global.xai.grok-4.6')
    expect(ids).toContain('us.xai.grok-4.6')
    expect(ids).not.toContain('xai.grok-4.6')
  })

  test('display names carry the routing suffix and capabilities are set', () => {
    const usModel = allModels.find((m) => m.modelId === 'us.xai.grok-4.6')
    expect(usModel?.modelName).toBe('Grok 4.6 (US)')
    expect(usModel?.toolUse).toBe(true)
    expect(usModel?.supportsThinking).toBe(true)
    expect(usModel?.maxTokensLimit).toBe(32768)

    const globalModel = allModels.find((m) => m.modelId === 'global.xai.grok-4.6')
    expect(globalModel?.modelName).toBe('Grok 4.6 (Global)')
  })

  test('Grok 4.3 is not registered (not available via Converse)', () => {
    const ids = allModels.map((m) => m.modelId)
    expect(ids.some((id) => id.includes('grok-4.3'))).toBe(false)
  })

  test('getModelConfig resolves prefixed ids to the right config', () => {
    expect(getModelConfig('us.xai.grok-4.6')?.name).toBe('Grok 4.6')
    expect(getModelConfig('global.xai.grok-4.6')?.name).toBe('Grok 4.6')
  })

  test('no explicit prompt cache is declared (implicit caching only)', () => {
    expect(getModelConfig('us.xai.grok-4.6')?.cache).toBeUndefined()
  })

  test('only the global profile reaches regions outside the US', () => {
    const euIds = getModelsForRegion('eu-west-1').map((m) => m.modelId)
    expect(euIds).toContain('global.xai.grok-4.6')
    expect(euIds).not.toContain('us.xai.grok-4.6')

    const usIds = getModelsForRegion('us-east-1').map((m) => m.modelId)
    expect(usIds).toContain('global.xai.grok-4.6')
    expect(usIds).toContain('us.xai.grok-4.6')
  })

  test('pricing uses the Geo/US CRIS rate ($2.20/$6.60/$0.55 per 1M)', () => {
    const calc = new PricingCalculator('us.xai.grok-4.6')
    expect(calc.calculateInputCost(1_000_000)).toBeCloseTo(2.2, 5)
    expect(calc.calculateOutputCost(1_000_000)).toBeCloseTo(6.6, 5)
    expect(calc.calculateCacheReadCost(1_000_000)).toBeCloseTo(0.55, 5)
  })
})

// Max Output Tokens is a single global setting, so every request is clamped to
// the selected model's own ceiling before it is sent.
describe('clampMaxTokensToModelLimit', () => {
  test('lowers a request that exceeds the model ceiling', () => {
    // Haiku 4.5 stops at 64000 even though the setting allows 128000.
    expect(clampMaxTokensToModelLimit('us.anthropic.claude-haiku-4-5-20251001-v1:0', 128000)).toBe(
      64000
    )
    // First-generation Nova models stop far lower.
    expect(clampMaxTokensToModelLimit('us.amazon.nova-lite-v1:0', 128000)).toBe(5120)
  })

  test('leaves a request at or below the ceiling untouched', () => {
    expect(clampMaxTokensToModelLimit('us.anthropic.claude-opus-5', 128000)).toBe(128000)
    expect(clampMaxTokensToModelLimit('us.anthropic.claude-opus-5', 4096)).toBe(4096)
    expect(clampMaxTokensToModelLimit('us.openai.gpt-6-astra', 8192)).toBe(8192)
  })

  test('passes through models the registry does not know', () => {
    // Custom inference profile ARNs and imported models have no known ceiling,
    // so clamping them to a default would silently truncate their output.
    expect(
      clampMaxTokensToModelLimit(
        'arn:aws:bedrock:us-east-1:123456789012:imported-model/abcdefg',
        200000
      )
    ).toBe(200000)
  })

  test('passes through an unset maxTokens rather than inventing one', () => {
    expect(clampMaxTokensToModelLimit('us.anthropic.claude-opus-5', undefined)).toBeUndefined()
  })

  test('every registered text model declares a max output ceiling', () => {
    // A model with no ceiling silently opts out of clamping, so guard against
    // an entry being added without one.
    const missing = allModels.filter((m) => !m.maxTokensLimit).map((m) => m.modelId)
    expect(missing).toEqual([])
  })
})

// Output ceilings verified against each model's AWS model card and confirmed
// against the Converse API, which rejects an over-large maxTokens with
// "exceeds the model limit of N".
describe('model output ceilings', () => {
  test.each([
    ['us.anthropic.claude-haiku-4-5-20251001-v1:0', 64000],
    ['us.anthropic.claude-sonnet-4-5-20250929-v1:0', 64000],
    ['us.anthropic.claude-opus-4-1-20250805-v1:0', 32000],
    ['us.anthropic.claude-opus-5', 128000],
    ['us.anthropic.claude-opus-5-5', 128000],
    ['us.anthropic.claude-sonnet-5', 128000],
    ['us.amazon.nova-premier-v1:0', 32000],
    ['us.amazon.nova-pro-v1:0', 5120],
    ['us.amazon.nova-2-lite-v1:0', 64000],
    ['us.deepseek.r1-v1:0', 32768],
    ['us.openai.gpt-6-astra', 128000],
    ['us.openai.gpt-6-sol', 128000],
    ['us.openai.gpt-6-luna', 128000],
    ['us.openai.gpt-5.6-sol', 128000],
    ['openai.gpt-oss-120b-1:0', 16384],
    ['openai.gpt-oss-20b-1:0', 16384],
    ['moonshotai.kimi-k2.5', 16384],
    ['us.moonshotai.kimi-k3', 16384],
    ['us.xai.grok-4.6', 32768]
  ])('%s caps output at %i tokens', (modelId, expected) => {
    expect(getModelConfig(modelId as string)?.maxTokensLimit).toBe(expected)
  })
})
