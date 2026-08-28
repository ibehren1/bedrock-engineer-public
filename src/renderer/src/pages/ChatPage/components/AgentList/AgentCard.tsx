import React from 'react'
import { CustomAgent } from '@/types/agent-chat'
import { TbRobot } from 'react-icons/tb'
import { MdDragIndicator } from 'react-icons/md'
import { useTranslation } from 'react-i18next'
import { AgentIconView } from '@renderer/components/icons/AgentIconView'
import { AgentActionsDropdown } from './AgentActionsDropdown'

interface AgentCardProps {
  agent: CustomAgent
  isCustomAgent: boolean
  isSelected: boolean
  onSelect: (agentId: string) => void
  onEdit?: (agent: CustomAgent) => void
  onDuplicate?: (agent: CustomAgent) => void
  onDelete?: (agentId: string) => void
  onSaveAsShared?: (agent: CustomAgent) => void
  onShareToOrganization?: (agent: CustomAgent) => void
  onConvertToStrands?: (agentId: string) => void
  /** HTML5 drag handlers from useAgentDragOrder; empty when reordering is off */
  dragProps?: React.HTMLAttributes<HTMLDivElement> & { draggable?: boolean }
  dragClassName?: string
}

export const AgentCard: React.FC<AgentCardProps> = ({
  agent,
  isCustomAgent,
  isSelected,
  onSelect,
  onEdit,
  onDuplicate,
  onDelete,
  onSaveAsShared,
  onShareToOrganization,
  onConvertToStrands,
  dragProps,
  dragClassName
}) => {
  const { t } = useTranslation()

  return (
    <div
      className={`group relative flex items-start p-4 border
        border-gray-200 dark:border-gray-700
        rounded-lg bg-white dark:bg-gray-800 hover:border-blue-500
        dark:hover:border-blue-400 transition-all duration-200 cursor-pointer
        ${dragClassName || ''}`}
      onClick={() => onSelect(agent.id!)}
      {...dragProps}
    >
      {dragProps?.draggable && (
        <MdDragIndicator
          className="absolute left-1 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 dark:text-gray-600
            opacity-0 group-hover:opacity-100 transition-opacity"
          title={t('myAgents.dragToReorder')}
        />
      )}
      <div className="flex-shrink-0 mr-4">
        <div
          className={`w-10 h-10 flex items-center justify-center
            ${!isCustomAgent ? 'bg-gray-200 dark:bg-gray-700/80' : 'bg-blue-100 dark:bg-blue-800/40'}
            rounded-lg border border-transparent dark:border-gray-600 shadow-sm dark:shadow-inner`}
        >
          {agent.icon ? (
            <AgentIconView
              icon={agent.icon}
              className="w-5 h-5 dark:text-gray-100"
              style={{
                color: agent.iconColor || 'var(--tw-text-gray-700)',
                filter: 'brightness(1.2) contrast(1.2)'
              }}
            />
          ) : (
            <TbRobot className="w-5 h-5 text-blue-600 dark:text-gray-100 filter brightness-110 contrast-125" />
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0 relative pr-10">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-medium text-gray-900 dark:text-white pr-6 truncate">
            {agent.name}
          </h3>
          <div className="flex items-center gap-1">
            {isSelected && (
              <span
                title={t('myAgents.activeInChat')}
                className="px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded"
              >
                {t('active')}
              </span>
            )}
            {agent.isShared && (
              <span className="px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 rounded">
                {t('shared')}
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 break-words">
          {t(agent.description) || t('noDescription')}
        </p>
        <div className="absolute right-0 top-0">
          <AgentActionsDropdown
            agent={agent}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
            onSaveAsShared={onSaveAsShared}
            onShareToOrganization={onShareToOrganization}
            onConvertToStrands={onConvertToStrands}
          />
        </div>
      </div>
    </div>
  )
}
