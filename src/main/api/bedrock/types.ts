import {
  GuardrailConfiguration,
  InferenceConfiguration,
  Message,
  SystemContentBlock,
  ToolConfiguration
} from '@aws-sdk/client-bedrock-runtime'
import { ConfigStore } from '../../../preload/store'

export type CallConverseAPIProps = {
  modelId: string
  messages: Message[]
  system: SystemContentBlock[]
  toolConfig?: ToolConfiguration
  guardrailConfig?: GuardrailConfiguration
  inferenceConfig?: InferenceConfiguration
  /**
   * Disable extended thinking for this request regardless of the global thinking
   * mode setting. Used by lightweight internal calls (e.g. title generation) that
   * gain nothing from thinking and would otherwise hit the `max_tokens` >
   * `thinking.budget_tokens` validation constraint.
   */
  disableThinking?: boolean
}

export type ProxyConfiguration = {
  enabled: boolean
  host?: string
  port?: number
  username?: string
  password?: string
  protocol?: 'http' | 'https'
}

export type ProxySettings = {
  proxyConfig?: ProxyConfiguration
}

export type AWSCredentials = {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
  profile?: string
  useProfile?: boolean
  proxyConfig?: ProxyConfiguration
}

export interface ThinkingMode {
  type: 'enabled' | 'disabled'
  budget_tokens?: number
}

export type InferenceParams = {
  maxTokens: number
  temperature: number
  topP?: number
  thinking?: ThinkingMode
}

export type ServiceContext = {
  store: ConfigStore
}
