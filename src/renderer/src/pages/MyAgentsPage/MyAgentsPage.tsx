import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { FiInfo } from 'react-icons/fi'
import { CustomAgent } from '@/types/agent-chat'
import useSetting from '@renderer/hooks/useSetting'
import { AgentForm } from '@renderer/pages/ChatPage/components/AgentForm/AgentForm'
import { AgentList } from '@renderer/pages/ChatPage/components/AgentList'
import { useShareToOrganizationModal } from '@renderer/pages/ChatPage/modals/useShareToOrganizationModal'
import { useAgentCrud } from './useAgentCrud'

/**
 * My Agents: the place to create, edit and maintain agents.
 * Agent selection happens in the agent dropdown next to the chat input.
 */
export const MyAgentsPage: React.FC = () => {
  const { t } = useTranslation()
  const {
    agents,
    selectedAgentId,
    hiddenDefaultAgents,
    unhideDefaultAgent,
    unhideAllDefaultAgents
  } = useSetting()
  const { saveAgent, deleteAgent, duplicateAgent, saveAsShared, convertToStrands } = useAgentCrud()

  const [editingAgent, setEditingAgent] = useState<CustomAgent | null>(null)
  const [isInfoExpanded, setIsInfoExpanded] = useState(false)

  const { ShareToOrganizationModal, openModal: openShareToOrganizationModal } =
    useShareToOrganizationModal()

  const handleSaveAgent = (agent: CustomAgent) => {
    const saved = saveAgent(agent, !!editingAgent?.id)
    if (saved) {
      setEditingAgent(null)
    }
  }

  // 一覧のクリックは編集を開く（選択はチャット側のドロップダウンで行う）
  const handleActivateAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId)
    if (!agent) return

    const isEditable = (agent.isCustom ?? true) && !agent.isShared
    if (isEditable) {
      setEditingAgent(agent)
      return
    }

    // Default agents are re-seeded from DEFAULT_AGENTS on every launch and shared
    // agents live in files, so neither can be edited here. Say so rather than
    // letting the click do nothing.
    toast(agent.isShared ? t('myAgents.sharedNotEditable') : t('myAgents.defaultNotEditable'), {
      icon: 'ℹ️'
    })
  }

  return (
    <div className="flex flex-col h-full px-4 py-6">
      <header className="mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold dark:text-white">
            {editingAgent ? t('editAgent') : t('myAgents.title')}
          </h1>
          <div
            className="flex items-center cursor-pointer text-blue-600 dark:text-blue-400
              hover:text-blue-700 dark:hover:text-blue-300 transition-colors duration-200"
            onClick={() => setIsInfoExpanded(!isInfoExpanded)}
          >
            <FiInfo className="mr-1" />
            <span className="text-sm font-medium">{t('agentSettings.infoTitle')}</span>
          </div>
        </div>

        {!editingAgent && (
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {t('myAgents.description')}{' '}
            <span className="text-gray-500 dark:text-gray-500">{t('myAgents.reorderHint')}</span>
          </p>
        )}

        {isInfoExpanded && (
          <div className="bg-blue-50 dark:bg-gray-800/50 p-4 rounded-lg border border-blue-200 dark:border-gray-600/30 mt-4">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('agentSettings.description')}
            </p>
            <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
              {t('agentSettings.sharedAgentsDescription')}
            </p>
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0">
        {editingAgent ? (
          <AgentForm
            agent={editingAgent}
            onSave={handleSaveAgent}
            onCancel={() => setEditingAgent(null)}
          />
        ) : (
          <>
            <AgentList
              agents={agents}
              selectedAgentId={selectedAgentId}
              onSelectAgent={handleActivateAgent}
              onAddNewAgent={() => setEditingAgent({} as CustomAgent)}
              onEditAgent={setEditingAgent}
              onDuplicateAgent={duplicateAgent}
              onDeleteAgent={deleteAgent}
              onSaveAsShared={saveAsShared}
              onShareToOrganization={openShareToOrganizationModal}
              onConvertToStrands={convertToStrands}
              hiddenAgents={hiddenDefaultAgents}
              onUnhideAgent={unhideDefaultAgent}
              onUnhideAll={unhideAllDefaultAgents}
              allowReorder
            />

            <ShareToOrganizationModal />
          </>
        )}
      </div>
    </div>
  )
}

export default MyAgentsPage
