import { getToken } from '@aws/bedrock-token-generator'
import { fromIni } from '@aws-sdk/credential-providers'
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@smithy/types'
import type { AWSCredentials } from '../types'
import { createCategoryLogger } from '../../../../common/logger'

const tokenLogger = createCategoryLogger('bedrock:mantle:token')

/**
 * Bedrock short-term API tokens are valid for up to 12 hours. We cache each
 * token slightly below that horizon so a single long chat session reuses one
 * token instead of re-signing on every request, while still refreshing well
 * before the underlying credentials expire.
 */
const TOKEN_TTL_MS = 11 * 60 * 60 * 1000 // 11 hours
const TOKEN_EXPIRES_IN_SECONDS = 12 * 60 * 60 // request the maximum (12h)

type CacheEntry = {
  token: string
  expiresAt: number
}

/**
 * Cache key must capture everything that changes the resulting token so that
 * switching profile / region / credentials never returns a stale token.
 */
function cacheKeyFor(creds: AWSCredentials): string {
  if (creds.useProfile) {
    return `profile:${creds.profile ?? 'default'}:${creds.region}`
  }
  return `key:${creds.accessKeyId ?? ''}:${creds.region}`
}

const tokenCache = new Map<string, CacheEntry>()

/**
 * Resolve the credentials source for token signing from the app's stored AWS
 * config. Mirrors the branching in client.ts: named profile via fromIni, or
 * inline access-key/secret/session-token credentials.
 */
function resolveCredentials(
  creds: AWSCredentials
): AwsCredentialIdentity | AwsCredentialIdentityProvider {
  if (creds.useProfile) {
    return fromIni({ profile: creds.profile })
  }

  return {
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    sessionToken: creds.sessionToken
  }
}

/**
 * Generate (or return a cached) short-term Bedrock bearer token derived from the
 * app's existing AWS credentials. The token authenticates requests to the
 * bedrock-mantle OpenAI-compatible endpoint via `Authorization: Bearer <token>`.
 *
 * No separate API key is stored: the token is minted on demand from the same
 * credentials (inline keys or named profile) used for every other Bedrock call.
 */
export async function getMantleBearerToken(creds: AWSCredentials): Promise<string> {
  const key = cacheKeyFor(creds)
  const cached = tokenCache.get(key)
  const now = Date.now()

  if (cached && cached.expiresAt > now) {
    return cached.token
  }

  const token = await getToken({
    credentials: resolveCredentials(creds),
    region: creds.region,
    expiresInSeconds: TOKEN_EXPIRES_IN_SECONDS
  })

  tokenCache.set(key, { token, expiresAt: now + TOKEN_TTL_MS })
  tokenLogger.debug('Generated Bedrock bearer token for mantle endpoint', {
    region: creds.region,
    useProfile: !!creds.useProfile
  })

  return token
}

/** Clear the token cache (used by tests and on credential changes). */
export function clearMantleTokenCache(): void {
  tokenCache.clear()
}
