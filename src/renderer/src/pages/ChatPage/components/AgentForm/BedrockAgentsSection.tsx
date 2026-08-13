import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BedrockAgent } from '@/types/agent'
import { EditIcon, RemoveIcon } from '@renderer/components/icons/ToolIcons'

interface BedrockAgentsSectionProps {
  agents: BedrockAgent[]
  onChange: (agents: BedrockAgent[]) => void
}

export const BedrockAgentsSection: React.FC<BedrockAgentsSectionProps> = ({
  agents = [],
  onChange
}) => {
  const { t } = useTranslation()
  const [newAgentId, setNewAgentId] = useState('')
  const [newAliasId, setNewAliasId] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [editMode, setEditMode] = useState<string | null>(null)
  const [editData, setEditData] = useState<BedrockAgent>({
    agentId: '',
    aliasId: '',
    description: ''
  })

  const handleAddAgent = () => {
    if (newAgentId.trim() && newAliasId.trim() && newDescription.trim()) {
      onChange([
        ...agents,
        {
          agentId: newAgentId.trim(),
          aliasId: newAliasId.trim(),
          description: newDescription.trim()
        }
      ])
      setNewAgentId('')
      setNewAliasId('')
      setNewDescription('')
    }
  }

  const handleRemoveAgent = (agentId: string) => {
    onChange(agents.filter((agent) => agent.agentId !== agentId))
  }

  const handleEditAgent = (agent: BedrockAgent) => {
    setEditMode(agent.agentId)
    setEditData({ ...agent })
  }

  const handleSaveEdit = () => {
    if (editData.agentId.trim() && editData.aliasId.trim() && editData.description.trim()) {
      onChange(agents.map((agent) => (agent.agentId === editMode ? { ...editData } : agent)))
      setEditMode(null)
      setEditData({
        agentId: '',
        aliasId: '',
        description: ''
      })
    }
  }

  const handleCancelEdit = () => {
    setEditMode(null)
    setEditData({
      agentId: '',
      aliasId: '',
      description: ''
    })
  }

  return (
    <div className="space-y-4 border border-gray-200 dark:border-gray-700 rounded-md p-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-white">
          {t('Bedrock Agents')}
        </h3>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t('Configure which Bedrock Agents this agent can access.')}
      </p>

      {/* Bedrock Agent 追加フォーム */}
      <div className="flex flex-col gap-2 mt-4">
        <h4 className="font-medium text-sm mb-2">{t('Add New Bedrock Agent')}</h4>

        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            {t('Agent ID')}
          </label>
          <input
            type="text"
            value={newAgentId}
            onChange={(e) => setNewAgentId(e.target.value)}
            placeholder="e.g., AGENT123456"
            className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          />
        </div>

        <div className="mt-2">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            {t('Alias ID')}
          </label>
          <input
            type="text"
            value={newAliasId}
            onChange={(e) => setNewAliasId(e.target.value)}
            placeholder="e.g., ALIAS123456"
            className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          />
        </div>

        <div className="mt-2">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            {t('Description')}
          </label>
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="e.g., Code interpreter agent"
            rows={2}
            className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 resize-vertical"
          />
        </div>

        <button
          onClick={handleAddAgent}
          disabled={!newAgentId.trim() || !newAliasId.trim() || !newDescription.trim()}
          className="px-4 py-1.5 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed mt-2 w-fit"
        >
          {t('Add Agent')}
        </button>
      </div>

      {/* 登録済み Bedrock Agent リスト */}
      <div className="space-y-3 mt-6">
        <h4 className="font-medium text-sm">{t('Available Bedrock Agents')}</h4>
        <div className="grid grid-cols-1 gap-2">
          {agents.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              {t('No Bedrock Agents registered yet')}
            </p>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.agentId}
                className="flex flex-col p-3 text-sm bg-gray-100 dark:bg-gray-900 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-700"
              >
                {editMode === agent.agentId ? (
                  // 編集モード
                  <div className="flex flex-col gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        {t('Agent ID')}
                      </label>
                      <input
                        type="text"
                        value={editData.agentId}
                        onChange={(e) => setEditData({ ...editData, agentId: e.target.value })}
                        className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
                      />
                    </div>
                    <div className="mt-2">
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        {t('Alias ID')}
                      </label>
                      <input
                        type="text"
                        value={editData.aliasId}
                        onChange={(e) => setEditData({ ...editData, aliasId: e.target.value })}
                        className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
                      />
                    </div>
                    <div className="mt-2">
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        {t('Description')}
                      </label>
                      <textarea
                        value={editData.description}
                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                        rows={2}
                        className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 resize-vertical"
                      />
                    </div>
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        {t('Cancel')}
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={
                          !editData.agentId.trim() ||
                          !editData.aliasId.trim() ||
                          !editData.description.trim()
                        }
                        className="px-3 py-1 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {t('Save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  // 表示モード
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{agent.description}</span>
                        <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          <div>
                            <span className="font-mono">Agent ID:</span> {agent.agentId}
                          </div>
                          <div>
                            <span className="font-mono">Alias ID:</span> {agent.aliasId}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditAgent(agent)}
                          className="text-blue-500 hover:text-blue-600 p-1"
                          title="Edit"
                          aria-label="Edit agent"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => handleRemoveAgent(agent.agentId)}
                          className="text-red-500 hover:text-red-600 p-1"
                          title="Remove"
                          aria-label="Remove agent"
                        >
                          <RemoveIcon />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default BedrockAgentsSection
