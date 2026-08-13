import OpenAI from 'openai'
import { createProxyAgents } from '../../../lib/proxy-utils'
import type { AWSCredentials } from '../types'
import { getMantleBearerToken } from './tokenProvider'

/**
 * Regions where the bedrock-mantle OpenAI-compatible endpoint (Responses API)
 * is available for OpenAI GPT models (in-region only; no geo/global inference).
 * The union of all supported GPT model regions: GPT-5.5 / GPT-5.6 Sol are
 * us-east-1/us-east-2 only, while GPT-5.6 Luna/Terra and GPT-5.4 add us-west-2.
 */
export const MANTLE_SUPPORTED_REGIONS = ['us-east-1', 'us-east-2', 'us-west-2'] as const

const DEFAULT_MANTLE_REGION = 'us-east-2'

/**
 * Build the bedrock-mantle OpenAI-compatible base URL for a region.
 *
 * GPT-5.5 is served on the `openai/v1` path (note: this differs from the plain
 * `v1` path used by other models on the responses endpoint — see the model
 * card note). The OpenAI SDK appends `/responses` to this base URL.
 */
export function getMantleBaseUrl(region: string): string {
  return `https://bedrock-mantle.${region}.api.aws/openai/v1`
}

/**
 * Resolve the region to use for a mantle request. Falls back to a supported
 * region if the app is currently configured for a region where the mantle
 * endpoint / GPT models are not offered.
 */
export function resolveMantleRegion(region: string | undefined): string {
  if (region && (MANTLE_SUPPORTED_REGIONS as readonly string[]).includes(region)) {
    return region
  }
  return DEFAULT_MANTLE_REGION
}

/**
 * Create an OpenAI SDK client pointed at the Bedrock mantle endpoint,
 * authenticated with a short-term Bedrock bearer token derived from the app's
 * AWS credentials. Honors the app's proxy configuration.
 */
export async function createMantleClient(awsCredentials: AWSCredentials): Promise<OpenAI> {
  const region = resolveMantleRegion(awsCredentials.region)
  const token = await getMantleBearerToken({ ...awsCredentials, region })

  // Reuse the app's proxy handling — createProxyAgents returns an https agent
  // usable by the OpenAI SDK's `httpAgent` option when a proxy is configured.
  const proxyAgents = createProxyAgents(awsCredentials, {
    includeHttpAgent: true,
    includeHttpsAgent: true
  })

  return new OpenAI({
    apiKey: token,
    baseURL: getMantleBaseUrl(region),
    // The OpenAI SDK uses a single `httpAgent` for both http and https.
    ...(proxyAgents?.httpsAgent ? { httpAgent: proxyAgents.httpsAgent } : {}),
    // Long timeout for agentic / reasoning workloads (matches Bedrock runtime clients).
    timeout: 300000,
    maxRetries: 2
  })
}
