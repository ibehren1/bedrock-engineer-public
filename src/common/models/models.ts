import type { BedrockSupportRegion, LLM, ThinkingType } from '../../types/llm'

/**
 * Type definition for cacheable fields
 */
export type CacheableField = 'messages' | 'system' | 'tools'

/**
 * Type definition for model providers
 */
export type ModelProvider =
  | 'anthropic'
  | 'amazon'
  | 'deepseek'
  | 'stability'
  | 'openai'
  | 'moonshotai'

/**
 * Type definition for model categories
 */
export type ModelCategory = 'text' | 'image'

/**
 * Type definition for inference profiles
 */
export type InferenceProfileType =
  | 'base' // Single region, no prefix
  | 'global' // global. - All commercial regions
  | 'regional-us' // us. - US region
  | 'regional-eu' // eu. - EU region
  | 'regional-apac' // apac. - APAC region
  | 'jp' // jp. - Japan domestic only

/**
 * Inference profile definition
 * Structure representing Amazon Bedrock inference profiles
 */
export interface InferenceProfile {
  /**
   * Type of inference profile
   * - base: Direct execution in a single region (no prefix)
   * - global: Global routing to all commercial AWS regions
   * - regional-us/eu/apac: Cross-region inference within specific geography
   * - jp: Cross-region inference limited to Japan (Tokyo/Osaka)
   */
  type: InferenceProfileType

  /**
   * Prefix added to model ID
   * - 'global': Global inference profile
   * - 'us': US region cross-region inference
   * - 'eu': EU region cross-region inference
   * - 'apac': APAC region cross-region inference
   * - 'jp': Japan domestic inference
   * - undefined: Base model (no prefix)
   */
  prefix?: string

  /**
   * List of AWS regions where this profile can process requests
   * For cross-region inference, load is automatically balanced across these regions
   */
  regions: BedrockSupportRegion[]

  /**
   * Suffix added to display name in UI
   * Examples: "(Global)", "(JP)", "(US)", "(EU)", "(APAC)"
   * undefined for base models
   */
  displaySuffix?: string
}

/**
 * Unified model configuration interface
 */
export interface ModelConfig {
  baseId: string
  name: string
  provider: ModelProvider
  category: ModelCategory

  // Features
  toolUse: boolean
  maxTokensLimit: number
  supportsThinking?: boolean
  supportedThinkingTypes?: ThinkingType[] // Which thinking API types the model accepts
  supportsStreamingToolUse?: boolean // Support for Tool Use with streaming

  // Inference profiles (new design)
  inferenceProfiles: InferenceProfile[]

  // Pricing (dollar price per 1000 tokens)
  pricing?: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }

  // Cache configuration
  cache?: {
    supported: boolean
    cacheableFields: CacheableField[]
  }
}

/**
 * Unified model registry
 */
const MODEL_REGISTRY: ModelConfig[] = [
  // Claude Haiku 4.5
  {
    baseId: 'claude-haiku-4-5-20251001-v1:0',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 64000,
    supportsThinking: true,
    supportedThinkingTypes: ['enabled'],
    inferenceProfiles: [
      {
        type: 'global',
        prefix: 'global',
        regions: [
          'us-east-1',
          'us-east-2',
          'us-west-1',
          'us-west-2',
          'eu-central-1',
          'eu-central-2',
          'eu-north-1',
          'eu-south-1',
          'eu-south-2',
          'eu-west-1',
          'eu-west-2',
          'eu-west-3',
          'ap-northeast-1',
          'ap-northeast-2',
          'ap-northeast-3',
          'ap-south-1',
          'ap-south-2',
          'ap-southeast-1',
          'ap-southeast-2',
          'ap-southeast-3',
          'ap-southeast-4',
          'ca-central-1',
          'sa-east-1'
        ],
        displaySuffix: '(Global)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'],
        displaySuffix: '(US)'
      },
      {
        type: 'regional-eu',
        prefix: 'eu',
        regions: [
          'eu-central-1',
          'eu-central-2',
          'eu-north-1',
          'eu-south-1',
          'eu-south-2',
          'eu-west-1',
          'eu-west-2',
          'eu-west-3'
        ],
        displaySuffix: '(EU)'
      },
      {
        type: 'jp',
        prefix: 'jp',
        regions: ['ap-northeast-1', 'ap-northeast-3'],
        displaySuffix: '(JP)'
      }
    ],
    pricing: {
      input: 0.001,
      output: 0.005,
      cacheRead: 0.0001,
      cacheWrite: 0.00125
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Claude Opus 4.1
  {
    baseId: 'claude-opus-4-1-20250805-v1:0',
    name: 'Claude Opus 4.1',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 32000,
    supportsThinking: true,
    supportedThinkingTypes: ['enabled'],
    inferenceProfiles: [
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ],
    pricing: {
      input: 0.015,
      output: 0.075,
      cacheRead: 0.0015,
      cacheWrite: 0.01875
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Claude Sonnet 4
  {
    baseId: 'claude-sonnet-4-20250514-v1:0',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 64000,
    supportsThinking: true,
    supportedThinkingTypes: ['enabled'],
    inferenceProfiles: [
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ],
    pricing: {
      input: 0.003,
      output: 0.015,
      cacheRead: 0.0003,
      cacheWrite: 0.00375
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Claude Opus 4
  {
    baseId: 'claude-opus-4-20250514-v1:0',
    name: 'Claude Opus 4',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 32000,
    supportsThinking: true,
    supportedThinkingTypes: ['enabled'],
    inferenceProfiles: [
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ],
    pricing: {
      input: 0.015,
      output: 0.075,
      cacheRead: 0.0015,
      cacheWrite: 0.01875
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Claude Sonnet 4.5
  {
    baseId: 'claude-sonnet-4-5-20250929-v1:0',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 64000,
    supportsThinking: true,
    supportedThinkingTypes: ['enabled'],
    inferenceProfiles: [
      {
        type: 'jp',
        prefix: 'jp',
        regions: ['ap-northeast-1', 'ap-northeast-3'],
        displaySuffix: '(JP)'
      },
      {
        type: 'global',
        prefix: 'global',
        regions: ['us-west-2', 'us-east-1', 'us-east-2', 'eu-west-1', 'ap-northeast-1'],
        displaySuffix: '(Global)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'],
        displaySuffix: '(US)'
      },
      {
        type: 'regional-eu',
        prefix: 'eu',
        regions: [
          'eu-central-1',
          'eu-central-2',
          'eu-north-1',
          'eu-south-1',
          'eu-south-2',
          'eu-west-1',
          'eu-west-2',
          'eu-west-3'
        ],
        displaySuffix: '(EU)'
      }
    ],
    pricing: {
      input: 0.003,
      output: 0.015,
      cacheRead: 0.0003,
      cacheWrite: 0.00375
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Claude Sonnet 4.6
  {
    baseId: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 64000,
    supportsThinking: true,
    supportedThinkingTypes: ['adaptive'],
    inferenceProfiles: [
      {
        type: 'jp',
        prefix: 'jp',
        regions: ['ap-northeast-1', 'ap-northeast-3'],
        displaySuffix: '(JP)'
      },
      {
        type: 'global',
        prefix: 'global',
        regions: ['us-west-2', 'us-east-1', 'us-east-2', 'eu-west-1', 'ap-northeast-1'],
        displaySuffix: '(Global)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'],
        displaySuffix: '(US)'
      },
      {
        type: 'regional-eu',
        prefix: 'eu',
        regions: [
          'eu-central-1',
          'eu-central-2',
          'eu-north-1',
          'eu-south-1',
          'eu-south-2',
          'eu-west-1',
          'eu-west-2',
          'eu-west-3'
        ],
        displaySuffix: '(EU)'
      }
    ],
    pricing: {
      input: 0.003,
      output: 0.015,
      cacheRead: 0.0003,
      cacheWrite: 0.00375
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Claude Sonnet 5
  {
    baseId: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 128000,
    supportsThinking: true,
    supportedThinkingTypes: ['adaptive'],
    inferenceProfiles: [
      {
        type: 'global',
        prefix: 'global',
        regions: ['us-west-2', 'us-east-1', 'us-east-2', 'eu-west-1', 'ap-northeast-1'],
        displaySuffix: '(Global)'
      },
      {
        type: 'jp',
        prefix: 'jp',
        regions: ['ap-northeast-1', 'ap-northeast-3'],
        displaySuffix: '(JP)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'],
        displaySuffix: '(US)'
      },
      {
        type: 'regional-eu',
        prefix: 'eu',
        regions: [
          'eu-central-1',
          'eu-central-2',
          'eu-north-1',
          'eu-south-1',
          'eu-south-2',
          'eu-west-1',
          'eu-west-2',
          'eu-west-3'
        ],
        displaySuffix: '(EU)'
      }
    ],
    pricing: {
      input: 0.002,
      output: 0.01,
      cacheRead: 0.0002,
      cacheWrite: 0.0025
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Claude Opus 4.6
  {
    baseId: 'claude-opus-4-6-v1',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 128000,
    supportsThinking: true,
    supportedThinkingTypes: ['adaptive'],
    inferenceProfiles: [
      {
        type: 'global',
        prefix: 'global',
        regions: ['us-west-2', 'us-east-1', 'us-east-2', 'eu-west-1', 'ap-northeast-1'],
        displaySuffix: '(Global)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ],
    pricing: {
      input: 0.005,
      output: 0.025,
      cacheRead: 0.0005,
      cacheWrite: 0.00625
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Claude Opus 4.7
  {
    baseId: 'claude-opus-4-7',
    name: 'Claude Opus 4.7',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 128000,
    supportsThinking: true,
    supportedThinkingTypes: ['adaptive'],
    inferenceProfiles: [
      {
        type: 'global',
        prefix: 'global',
        regions: ['us-west-2', 'us-east-1', 'us-east-2', 'eu-west-1', 'ap-northeast-1'],
        displaySuffix: '(Global)'
      },
      {
        type: 'jp',
        prefix: 'jp',
        regions: ['ap-northeast-1', 'ap-northeast-3'],
        displaySuffix: '(JP)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ],
    pricing: {
      input: 0.005,
      output: 0.025,
      cacheRead: 0.0005,
      cacheWrite: 0.00625
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Claude Opus 4.8
  {
    baseId: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 128000,
    supportsThinking: true,
    supportedThinkingTypes: ['adaptive'],
    inferenceProfiles: [
      {
        type: 'global',
        prefix: 'global',
        regions: ['us-west-2', 'us-east-1', 'us-east-2', 'eu-west-1', 'ap-northeast-1'],
        displaySuffix: '(Global)'
      },
      {
        type: 'jp',
        prefix: 'jp',
        regions: ['ap-northeast-1', 'ap-northeast-3'],
        displaySuffix: '(JP)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ],
    pricing: {
      input: 0.005,
      output: 0.025,
      cacheRead: 0.0005,
      cacheWrite: 0.00625
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Claude Opus 5
  // Anthropic's most advanced Opus model (launched 2026-07-24). 1M context window,
  // 128K max output, adaptive thinking on by default. Model ID has no version suffix:
  // invoked as e.g. `global.anthropic.claude-opus-5`.
  // NOTE: Opus 5 pricing is not yet published on the Bedrock pricing page; the values
  // below mirror Claude Opus 4.8 as a placeholder and should be updated once available.
  {
    baseId: 'claude-opus-5',
    name: 'Claude Opus 5',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 128000,
    supportsThinking: true,
    supportedThinkingTypes: ['adaptive'],
    inferenceProfiles: [
      {
        type: 'global',
        prefix: 'global',
        regions: ['us-west-2', 'us-east-1', 'us-east-2', 'eu-west-1', 'ap-northeast-1'],
        displaySuffix: '(Global)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'],
        displaySuffix: '(US)'
      },
      {
        type: 'regional-eu',
        prefix: 'eu',
        regions: [
          'eu-central-1',
          'eu-central-2',
          'eu-north-1',
          'eu-south-1',
          'eu-south-2',
          'eu-west-1',
          'eu-west-2',
          'eu-west-3'
        ],
        displaySuffix: '(EU)'
      }
    ],
    pricing: {
      input: 0.005,
      output: 0.025,
      cacheRead: 0.0005,
      cacheWrite: 0.00625
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Claude Fable 5
  {
    baseId: 'claude-fable-5',
    name: 'Claude Fable 5',
    provider: 'anthropic',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 128000,
    supportsThinking: true,
    supportedThinkingTypes: ['adaptive'],
    inferenceProfiles: [
      {
        type: 'global',
        prefix: 'global',
        regions: [
          'us-west-2',
          'us-east-1',
          'us-east-2',
          'eu-west-1',
          'eu-central-1',
          'ap-northeast-1',
          'ap-northeast-3',
          'ap-southeast-1',
          'ap-southeast-2'
        ],
        displaySuffix: '(Global)'
      },
      {
        type: 'regional-eu',
        prefix: 'eu',
        regions: [
          'eu-north-1',
          'eu-west-3',
          'eu-south-1',
          'eu-south-2',
          'eu-west-1',
          'eu-central-1'
        ],
        displaySuffix: '(EU)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ],
    pricing: {
      input: 0.01,
      output: 0.05,
      cacheRead: 0.001,
      cacheWrite: 0.0125
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system', 'tools']
    }
  },

  // Amazon Nova Premier
  {
    baseId: 'nova-premier-v1:0',
    name: 'Amazon Nova Premier',
    provider: 'amazon',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 32000,
    inferenceProfiles: [
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ]
  },

  // Amazon Nova Pro
  {
    baseId: 'nova-pro-v1:0',
    name: 'Amazon Nova Pro',
    provider: 'amazon',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 5120,
    inferenceProfiles: [
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(US)'
      },
      {
        type: 'regional-eu',
        prefix: 'eu',
        regions: ['eu-central-1', 'eu-north-1', 'eu-south-1', 'eu-west-1', 'eu-west-3'],
        displaySuffix: '(EU)'
      },
      {
        type: 'regional-apac',
        prefix: 'apac',
        regions: [
          'ap-northeast-1',
          'ap-northeast-2',
          'ap-south-1',
          'ap-southeast-1',
          'ap-southeast-2'
        ],
        displaySuffix: '(APAC)'
      }
    ],
    pricing: {
      input: 0.0008,
      output: 0.0032,
      cacheRead: 0.0002,
      cacheWrite: 0
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system']
    }
  },

  // Amazon Nova Lite
  {
    baseId: 'nova-lite-v1:0',
    name: 'Amazon Nova Lite',
    provider: 'amazon',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 5120,
    inferenceProfiles: [
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(US)'
      },
      {
        type: 'regional-eu',
        prefix: 'eu',
        regions: ['eu-central-1', 'eu-north-1', 'eu-south-1', 'eu-south-2', 'eu-west-3'],
        displaySuffix: '(EU)'
      },
      {
        type: 'regional-apac',
        prefix: 'apac',
        regions: [
          'ap-northeast-1',
          'ap-northeast-2',
          'ap-south-1',
          'ap-southeast-1',
          'ap-southeast-2'
        ],
        displaySuffix: '(APAC)'
      }
    ],
    pricing: {
      input: 0.00006,
      output: 0.00024,
      cacheRead: 0.000015,
      cacheWrite: 0
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system']
    }
  },

  // Amazon Nova 2 Lite
  {
    baseId: 'nova-2-lite-v1:0',
    name: 'Amazon Nova 2 Lite',
    provider: 'amazon',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 5120,
    inferenceProfiles: [
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-west-2'],
        displaySuffix: '(US)'
      },
      {
        type: 'global',
        prefix: 'global',
        regions: ['us-east-1', 'us-west-2'],
        displaySuffix: '(Global)'
      }
    ]
  },

  // Amazon Nova Micro
  {
    baseId: 'nova-micro-v1:0',
    name: 'Amazon Nova Micro',
    provider: 'amazon',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 5120,
    inferenceProfiles: [
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(US)'
      },
      {
        type: 'regional-eu',
        prefix: 'eu',
        regions: ['eu-central-1', 'eu-north-1', 'eu-south-1', 'eu-south-2', 'eu-west-3'],
        displaySuffix: '(EU)'
      },
      {
        type: 'regional-apac',
        prefix: 'apac',
        regions: [
          'ap-northeast-1',
          'ap-northeast-2',
          'ap-south-1',
          'ap-southeast-1',
          'ap-southeast-2'
        ],
        displaySuffix: '(APAC)'
      }
    ],
    pricing: {
      input: 0.000035,
      output: 0.00014,
      cacheRead: 0.00000875,
      cacheWrite: 0
    },
    cache: {
      supported: true,
      cacheableFields: ['messages', 'system']
    }
  },

  // DeepSeek R1
  {
    baseId: 'r1-v1:0',
    name: 'DeepSeek R1',
    provider: 'deepseek',
    category: 'text',
    toolUse: false,
    maxTokensLimit: 32768,
    inferenceProfiles: [
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ]
  },

  // OpenAI GPT-5.6 Sol
  // Invoked through the Bedrock Converse API via a cross-region inference
  // profile (`us.openai.gpt-5.6-sol` / `global.openai.gpt-5.6-sol`); on-demand
  // invocation of the bare model ID is not supported. Most capable of the
  // GPT-5.6 family; frontier reasoning + agentic performance.
  // Pricing: $5.50/$33.00 per 1M in/out (stored per 1K).
  {
    baseId: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    provider: 'openai',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 128000,
    supportsThinking: true,
    supportedThinkingTypes: ['enabled'],
    inferenceProfiles: [
      {
        type: 'global',
        prefix: 'global',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(Global)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ],
    pricing: {
      input: 0.0055,
      output: 0.033,
      cacheRead: 0.00055,
      cacheWrite: 0.00688
    }
  },

  // OpenAI GPT-5.6 Terra
  // Invoked through the Bedrock Converse API via a cross-region inference
  // profile (`us.openai.gpt-5.6-terra` / `global.openai.gpt-5.6-terra`).
  // Balanced everyday model.
  // Pricing: $2.20/$13.20 per 1M in/out (stored per 1K).
  {
    baseId: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    provider: 'openai',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 128000,
    supportsThinking: true,
    supportedThinkingTypes: ['enabled'],
    inferenceProfiles: [
      {
        type: 'global',
        prefix: 'global',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(Global)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ],
    pricing: {
      input: 0.0022,
      output: 0.0132,
      cacheRead: 0.00022,
      cacheWrite: 0.00275
    }
  },

  // OpenAI GPT-5.6 Luna
  // Invoked through the Bedrock Converse API via a cross-region inference
  // profile (`us.openai.gpt-5.6-luna` / `global.openai.gpt-5.6-luna`).
  // Fast/affordable; high-volume classification, summarization, routing.
  // Pricing: $0.22/$1.32 per 1M in/out (stored per 1K).
  {
    baseId: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    provider: 'openai',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 128000,
    supportsThinking: true,
    supportedThinkingTypes: ['enabled'],
    inferenceProfiles: [
      {
        type: 'global',
        prefix: 'global',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(Global)'
      },
      {
        type: 'regional-us',
        prefix: 'us',
        regions: ['us-east-1', 'us-east-2', 'us-west-2'],
        displaySuffix: '(US)'
      }
    ],
    pricing: {
      input: 0.00022,
      output: 0.00132,
      cacheRead: 0.000022,
      cacheWrite: 0.000275
    }
  },

  // OpenAI GPT-OSS 120B
  {
    baseId: 'gpt-oss-120b-1:0',
    name: 'GPT-OSS 120B',
    provider: 'openai',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 8192,
    supportsThinking: false,
    inferenceProfiles: [
      {
        type: 'base',
        regions: ['us-west-2']
      }
    ],
    // Standard tier: $0.1545/$0.6180 per 1M in/out (stored per 1K).
    pricing: {
      input: 0.0001545,
      output: 0.000618,
      cacheRead: 0,
      cacheWrite: 0
    }
  },

  // OpenAI GPT-OSS 20B
  {
    baseId: 'gpt-oss-20b-1:0',
    name: 'GPT-OSS 20B',
    provider: 'openai',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 8192,
    supportsThinking: false,
    inferenceProfiles: [
      {
        type: 'base',
        regions: ['us-west-2']
      }
    ],
    // Standard tier: $0.0721/$0.3090 per 1M in/out (stored per 1K).
    pricing: {
      input: 0.0000721,
      output: 0.000309,
      cacheRead: 0,
      cacheWrite: 0
    }
  },

  // Moonshot AI Kimi K2.5
  // In-region only (no cross-region/global inference profile), model ID has no
  // version suffix: invoked as `moonshotai.kimi-k2.5`.
  {
    baseId: 'kimi-k2.5',
    name: 'Kimi K2.5',
    provider: 'moonshotai',
    category: 'text',
    toolUse: true,
    maxTokensLimit: 16384,
    supportsThinking: false,
    inferenceProfiles: [
      {
        type: 'base',
        regions: [
          'us-east-1',
          'us-east-2',
          'us-west-2',
          'eu-north-1',
          'eu-west-2',
          'ap-northeast-1',
          'ap-south-1',
          'ap-southeast-2',
          'ap-southeast-3',
          'ap-southeast-4',
          'sa-east-1'
        ]
      }
    ],
    pricing: {
      input: 0.0006,
      output: 0.003,
      cacheRead: 0,
      cacheWrite: 0
    }
  }

  // Custom model (this is example)
  // {
  //   baseId: 'arn:aws:bedrock:us-east-1:1234567890:imported-model/xxxx',
  //   name: 'DeepSeek-R1-Distill-Llama-8B',
  //   provider: 'deepseek',
  //   category: 'text',
  //   toolUse: true,
  //   maxTokensLimit: 4096,
  //   supportsStreamingToolUse: false,
  //   inferenceProfiles: [
  //     {
  //       type: 'base',
  //       regions: ['us-east-1']
  //     }
  //   ]
  // }
]

/**
 * Image generation model registry
 */
const IMAGE_GENERATION_MODELS: ModelConfig[] = [
  // Stability AI models
  {
    baseId: 'stability.sd3-5-large-v1:0',
    name: 'Stability SD3.5 Large',
    provider: 'stability',
    category: 'image',
    toolUse: false,
    maxTokensLimit: 0,
    inferenceProfiles: [
      {
        type: 'base',
        regions: ['us-west-2']
      }
    ]
  },
  {
    baseId: 'stability.sd3-large-v1:0',
    name: 'Stability SD3 Large',
    provider: 'stability',
    category: 'image',
    toolUse: false,
    maxTokensLimit: 0,
    inferenceProfiles: [
      {
        type: 'base',
        regions: ['us-west-2']
      }
    ]
  },
  {
    baseId: 'stability.stable-image-core-v1:0',
    name: 'Stability Stable Image Core v1.0',
    provider: 'stability',
    category: 'image',
    toolUse: false,
    maxTokensLimit: 0,
    inferenceProfiles: [
      {
        type: 'base',
        regions: ['us-west-2']
      }
    ]
  },
  {
    baseId: 'stability.stable-image-core-v1:1',
    name: 'Stability Stable Image Core v1.1',
    provider: 'stability',
    category: 'image',
    toolUse: false,
    maxTokensLimit: 0,
    inferenceProfiles: [
      {
        type: 'base',
        regions: ['us-west-2']
      }
    ]
  },
  {
    baseId: 'stability.stable-image-ultra-v1:0',
    name: 'Stability Stable Image Ultra v1.0',
    provider: 'stability',
    category: 'image',
    toolUse: false,
    maxTokensLimit: 0,
    inferenceProfiles: [
      {
        type: 'base',
        regions: ['us-west-2']
      }
    ]
  },
  {
    baseId: 'stability.stable-image-ultra-v1:1',
    name: 'Stability Stable Image Ultra v1.1',
    provider: 'stability',
    category: 'image',
    toolUse: false,
    maxTokensLimit: 0,
    inferenceProfiles: [
      {
        type: 'base',
        regions: ['us-west-2']
      }
    ]
  },
  // Amazon models
  {
    baseId: 'amazon.nova-canvas-v1:0',
    name: 'Amazon Nova Canvas',
    provider: 'amazon',
    category: 'image',
    toolUse: false,
    maxTokensLimit: 0,
    inferenceProfiles: [
      {
        type: 'base',
        regions: ['us-east-1', 'ap-northeast-1', 'eu-west-1']
      }
    ]
  },
  {
    baseId: 'amazon.titan-image-generator-v2:0',
    name: 'Amazon Titan Image Generator v2',
    provider: 'amazon',
    category: 'image',
    toolUse: false,
    maxTokensLimit: 0,
    inferenceProfiles: [
      {
        type: 'base',
        regions: ['us-east-1', 'us-west-2']
      }
    ]
  },
  {
    baseId: 'amazon.titan-image-generator-v1',
    name: 'Amazon Titan Image Generator v1',
    provider: 'amazon',
    category: 'image',
    toolUse: false,
    maxTokensLimit: 0,
    inferenceProfiles: [
      {
        type: 'base',
        regions: ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-west-2', 'ap-south-1']
      }
    ]
  }
]

/**
 * Check if model ID is in ARN format
 */
function isArnModelId(modelId: string): boolean {
  return modelId.startsWith('arn:aws:bedrock:')
}

/**
 * Remove region prefix from model ID to get base model name
 * Example: 'us.anthropic.claude-3-7-sonnet-20250219-v1:0' → 'anthropic.claude-3-7-sonnet-20250219-v1:0'
 */
export function getBaseModelId(modelId: string): string {
  // Region prefix pattern: specific region codes (e.g., 'us.', 'eu.', 'apac.', 'jp.', 'global.')
  const regionPrefixPattern = /^(us|eu|apac|jp|global)\./
  return modelId.replace(regionPrefixPattern, '')
}

/**
 * Generate full model ID from model configuration
 */
function generateFullModelId(config: ModelConfig, profile: InferenceProfile): string {
  // Return as-is if model ID is in ARN format
  if (isArnModelId(config.baseId)) {
    return config.baseId
  }

  // Add prefix if it exists (for cross-region inference profile)
  if (profile.prefix) {
    return `${profile.prefix}.${config.provider}.${config.baseId}`
  }

  // No prefix for base type
  return `${config.provider}.${config.baseId}`
}

/**
 * Create LLM object from model configuration
 */
function createLLMFromConfig(config: ModelConfig, profile: InferenceProfile): LLM {
  const modelId = generateFullModelId(config, profile)
  const modelName = profile.displaySuffix ? `${config.name} ${profile.displaySuffix}` : config.name

  return {
    modelId,
    modelName,
    toolUse: config.toolUse,
    maxTokensLimit: config.maxTokensLimit,
    supportsThinking: config.supportsThinking,
    supportedThinkingTypes: config.supportedThinkingTypes,
    regions: profile.regions
  }
}

/**
 * Generate all LLM objects from model configurations
 */
function generateModelsFromConfigs(): LLM[] {
  const models: LLM[] = []

  // Process only text models
  const textModels = MODEL_REGISTRY.filter((config) => config.category === 'text')

  textModels.forEach((config) => {
    config.inferenceProfiles.forEach((profile) => {
      models.push(createLLMFromConfig(config, profile))
    })
  })

  return models
}

// Generated model list
export const allModels = generateModelsFromConfigs()

/**
 * Get models by region
 */
export const getModelsForRegion = (region: BedrockSupportRegion): LLM[] => {
  const models = allModels.filter((model) => model.regions?.includes(region))
  return models.sort((a, b) => a.modelName.localeCompare(b.modelName))
}

/**
 * Get list of model IDs that support Thinking
 */
export const getThinkingSupportedModelIds = (): string[] => {
  return allModels.filter((model) => model.supportsThinking === true).map((model) => model.modelId)
}

/**
 * Get supported thinking types for a model ID.
 * Returns the thinking API types the model accepts ('enabled' and/or 'adaptive').
 */
export const getSupportedThinkingTypes = (modelId: string): ThinkingType[] => {
  const config = getModelConfig(modelId)
  return config?.supportedThinkingTypes || []
}

/**
 * Get image generation models by region
 */
export const getImageGenerationModelsForRegion = (region: BedrockSupportRegion) => {
  const models: Array<{ id: string; name: string }> = []

  IMAGE_GENERATION_MODELS.forEach((config) => {
    // Find inference profiles that include the specified region
    const hasRegion = config.inferenceProfiles.some((profile) => profile.regions.includes(region))

    if (hasRegion) {
      models.push({
        id: config.baseId,
        name: config.name
      })
    }
  })

  return models.sort((a, b) => {
    // Provider order: Amazon → Stability
    const providerOrderA = a.id.startsWith('amazon') ? 0 : 1
    const providerOrderB = b.id.startsWith('amazon') ? 0 : 1

    if (providerOrderA !== providerOrderB) {
      return providerOrderA - providerOrderB
    }

    // Within same provider, sort by name
    return a.name.localeCompare(b.name)
  })
}

/**
 * Model utility functions
 */
export const getModelMaxTokens = (modelId: string): number => {
  // Try exact match first
  let model = allModels.find((m) => m.modelId === modelId)

  // Try partial match if exact match not found
  if (!model) {
    model = allModels.find((m) => m.modelId.includes(modelId) || modelId.includes(m.modelId))
  }

  return model?.maxTokensLimit || 8192 // Default value
}

// =========================
// Pricing-related functions
// =========================

/**
 * Get model configuration
 */
export const getModelConfig = (modelId: string): ModelConfig | undefined => {
  const baseModelId = getBaseModelId(modelId)
  return MODEL_REGISTRY.find(
    (c) => baseModelId.includes(c.baseId) || baseModelId.includes(`${c.provider}.${c.baseId}`)
  )
}

/**
 * Check if model supports streaming with Tool Use
 */
export const supportsStreamingWithToolUse = (modelId: string): boolean => {
  const config = getModelConfig(modelId)
  // Return false only if supportsStreamingToolUse is explicitly false
  // If undefined, assume true (supported) by default
  return config?.supportsStreamingToolUse !== false
}
