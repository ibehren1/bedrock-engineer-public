import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FiExternalLink, FiLoader, FiSearch, FiZap } from 'react-icons/fi'
import {
  MCP_REGISTRY_BASE_URL,
  McpRegistryServer,
  registryLaunchLabel,
  registryServerLaunch,
  registryServerToConfigJson
} from '@/common/mcp/registry'
import {
  AgentMarketContext,
  buildMarketSearchTerms,
  marketUrls,
  suggestMarketCategories
} from './mcpMarket'
import { useMcpRegistrySearch } from './hooks/useMcpRegistrySearch'
import { preventModalClose } from './utils/eventUtils'

interface McpMarketPanelProps {
  /** The agent being edited, used to tailor links and search terms */
  agentContext: AgentMarketContext
  existingServerNames: string[]
  /** Loads a server's config into the JSON editor below for review */
  onUseSuggestion: (json: string) => void
}

const openExternal = (url: string) => window.open(url, '_blank', 'noopener,noreferrer')

/**
 * Find MCP servers: search the official MCP Registry (optionally with search
 * terms the model derives from the agent), and browse MCP Market by category.
 *
 * MCP Market has no API and blocks automated clients, so it is link-out only;
 * every server listed here comes from the registry.
 */
export const McpMarketPanel: React.FC<McpMarketPanelProps> = ({
  agentContext,
  existingServerNames,
  onUseSuggestion
}) => {
  const { t } = useTranslation()
  const { results, isSearching, isSuggesting, error, search, suggestAndSearch, clear } =
    useMcpRegistrySearch()
  const [query, setQuery] = useState('')

  const categories = suggestMarketCategories(agentContext)
  const marketTerms = buildMarketSearchTerms(agentContext)
  const busy = isSearching || isSuggesting

  return (
    <div
      className="bg-white dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/50 rounded-md p-3 space-y-3"
      onClick={preventModalClose}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {t('mcpMarket.title')}
          </h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {t('mcpMarket.description')}
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={() => openExternal(MCP_REGISTRY_BASE_URL)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
              border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200
              hover:bg-gray-100 dark:hover:bg-gray-700"
            title={MCP_REGISTRY_BASE_URL}
          >
            <FiExternalLink className="w-3.5 h-3.5" />
            {t('mcpMarket.registry')}
          </button>
          <button
            type="button"
            onClick={() => openExternal(marketUrls.search(marketTerms))}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
              border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200
              hover:bg-gray-100 dark:hover:bg-gray-700"
            title={marketTerms}
          >
            <FiExternalLink className="w-3.5 h-3.5" />
            {t('mcpMarket.browse')}
          </button>
        </div>
      </div>

      {/* Registry search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                search(query, existingServerNames)
              }
            }}
            placeholder={t('mcpMarket.searchPlaceholder')}
            className="w-full pl-8 pr-2 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600
              bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white
              focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <button
          type="button"
          disabled={busy || !query.trim()}
          onClick={() => search(query, existingServerNames)}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-gray-300 dark:border-gray-600
            text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700
            disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSearching ? <FiLoader className="w-3.5 h-3.5 animate-spin" /> : t('mcpMarket.search')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => suggestAndSearch({ ...agentContext, existingServerNames })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md
            bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-600
            disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isSuggesting ? (
            <FiLoader className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FiZap className="w-3.5 h-3.5" />
          )}
          {isSuggesting ? t('mcpMarket.suggesting') : t('mcpMarket.suggest')}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">
          {t('mcpMarket.searchFailed', { error })}
        </p>
      )}

      {results && (
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {results.terms.length === 0
                  ? t('mcpMarket.noTerms')
                  : results.servers.length > 0
                    ? t('mcpMarket.resultsCount', { count: results.servers.length })
                    : t('mcpMarket.noResults', {
                        terms: results.terms.map((query) => query.term).join(', ')
                      })}
              </p>
              {results.terms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {results.terms.map((query) => (
                    <span
                      key={query.term}
                      title={query.reason || undefined}
                      className="px-2 py-0.5 text-[11px] rounded-full bg-gray-100 dark:bg-gray-700
                        text-gray-700 dark:text-gray-200"
                    >
                      {query.term}
                      {query.reason && (
                        <span className="text-gray-500 dark:text-gray-400"> — {query.reason}</span>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={clear}
              className="shrink-0 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              {t('mcpMarket.clearSuggestions')}
            </button>
          </div>

          {results.servers.length > 0 && (
            <ul className="mt-2 space-y-2">
              {results.servers.map((server) => (
                <RegistryServerCard
                  key={server.name}
                  server={server}
                  onUse={() => {
                    const json = registryServerToConfigJson(server)
                    if (json) onUseSuggestion(json)
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      {/* MCP Market category links */}
      <div className="pt-2 border-t border-gray-200 dark:border-gray-700/50">
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1.5">
          {t('mcpMarket.categoriesForThisAgent')}
        </p>
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <button
              key={category.slug}
              type="button"
              onClick={() => openExternal(marketUrls.category(category.slug))}
              className="flex items-center gap-1 px-2 py-1 text-xs rounded-full
                bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300
                hover:bg-blue-100 dark:hover:bg-blue-900/50"
            >
              {category.label}
              <FiExternalLink className="w-3 h-3" />
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const RegistryServerCard: React.FC<{ server: McpRegistryServer; onUse: () => void }> = ({
  server,
  onUse
}) => {
  const { t } = useTranslation()

  const launch = registryServerLaunch(server)
  const launchLabel = registryLaunchLabel(server)
  const envVars = launch?.kind === 'command' ? launch.envVars : []

  return (
    <li className="border border-gray-200 dark:border-gray-700/50 rounded-md p-2.5 bg-gray-50 dark:bg-gray-900/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {server.title || server.shortName}
            </span>
            {server.version && (
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                v{server.version}
              </span>
            )}
            {launch?.kind === 'url' && (
              <span
                className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide rounded
                bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"
              >
                {t('mcpMarket.hosted')}
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-0.5 truncate">
            {server.name}
          </p>
          <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{server.description}</p>
          {launchLabel && (
            <code className="block mt-1 text-[11px] text-gray-600 dark:text-gray-400 truncate">
              {launchLabel}
            </code>
          )}
          {envVars.length > 0 && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              {t('mcpMarket.needsEnv', { vars: envVars.join(', ') })}
            </p>
          )}
          {!launch && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-1">
              {t('mcpMarket.noInstallInfo')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5 shrink-0">
          {launch && (
            <button
              type="button"
              onClick={onUse}
              className="px-2 py-1 text-xs font-medium rounded-md bg-gray-200 dark:bg-gray-700
                text-gray-800 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600 whitespace-nowrap"
            >
              {t('mcpMarket.useSuggestion')}
            </button>
          )}
          {server.repositoryUrl && (
            <button
              type="button"
              onClick={() => openExternal(server.repositoryUrl!)}
              className="flex items-center justify-center gap-1 px-2 py-1 text-xs rounded-md
                text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 whitespace-nowrap"
            >
              <FiExternalLink className="w-3 h-3" />
              {t('mcpMarket.source')}
            </button>
          )}
        </div>
      </div>
    </li>
  )
}
