import axios from 'axios'
import { store } from '../../preload/store'
import { createUtilProxyAgent } from '../lib/proxy-utils'
import { createCategoryLogger } from '../../common/logger'
import {
  MCP_REGISTRY_BASE_URL,
  McpRegistryServer,
  normalizeRegistryServers
} from '../../common/mcp/registry'

const logger = createCategoryLogger('mcp:registry')

/**
 * Search the official MCP Registry. Only the latest version of each server is
 * requested, since older versions carry stale package pins.
 */
export const searchMcpRegistry = async (
  query: string,
  limit = 10
): Promise<McpRegistryServer[]> => {
  const trimmed = (query || '').trim()
  if (!trimmed) return []

  const url = `${MCP_REGISTRY_BASE_URL}/v0/servers?search=${encodeURIComponent(
    trimmed
  )}&version=latest&limit=${Math.min(Math.max(limit, 1), 30)}`

  const proxyAgents = createUtilProxyAgent(store.get('aws')?.proxyConfig)
  const response = await axios.get(url, {
    timeout: 15000,
    headers: { Accept: 'application/json' },
    httpsAgent: proxyAgents?.httpsAgent
  })

  const servers = normalizeRegistryServers(response.data)
  logger.debug('MCP registry search', { query: trimmed, resultCount: servers.length })
  return servers
}
