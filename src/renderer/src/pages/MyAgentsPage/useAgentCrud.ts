import { useCallback } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { CustomAgent } from '@/types/agent-chat'
import useSetting from '@renderer/hooks/useSetting'
import { PROTECTED_DEFAULT_AGENT_IDS } from '@renderer/pages/ChatPage/components/AgentList'

/**
 * Create / update / duplicate / delete and export operations for the agents
 * shown on the My Agents page.
 */
export const useAgentCrud = () => {
  const { customAgents, saveCustomAgents, loadSharedAgents, removeDefaultAgent } = useSetting()
  const { t } = useTranslation()

  const saveAgent = useCallback(
    (agent: CustomAgent, isExistingAgent: boolean): boolean => {
      if (!agent.name || !agent.name.trim()) {
        toast.error(t('Agent name is required'))
        return false
      }

      if (!agent.description || !agent.description.trim()) {
        toast.error(t('Agent description is required'))
        return false
      }

      try {
        const finalAgentData: CustomAgent = {
          ...agent,
          // mcpServersが未定義または空配列の場合は明示的に空配列を設定
          mcpServers: agent.mcpServers || []
        }

        const updatedAgents = isExistingAgent
          ? customAgents.map((a) => (a.id === agent.id ? finalAgentData : a))
          : [...customAgents, finalAgentData]

        saveCustomAgents(updatedAgents)
        toast.success(t('Agent saved successfully'))
        return true
      } catch (error) {
        console.error('Error saving agent:', error)
        toast.error(t('Failed to save agent'))
        return false
      }
    },
    [customAgents, saveCustomAgents, t]
  )

  const deleteAgent = useCallback(
    (id: string) => {
      // デフォルトエージェントは再シードされないように削除済みとして記録する
      const agent = customAgents.find((a) => a.id === id)
      const isDefaultAgent = agent ? agent.isCustom === false : false

      if (isDefaultAgent) {
        if (PROTECTED_DEFAULT_AGENT_IDS.includes(id)) return
        removeDefaultAgent(id)
        return
      }

      saveCustomAgents(customAgents.filter((a) => a.id !== id))
    },
    [customAgents, removeDefaultAgent, saveCustomAgents]
  )

  const duplicateAgent = useCallback(
    (agent: CustomAgent) => {
      const newAgent: CustomAgent = {
        ...agent,
        id: crypto.randomUUID(),
        name: `${agent.name} (${t('copy')})`,
        isCustom: true, // 明示的にtrueに設定して削除・編集可能にする
        // 共有プロパティを削除（複製されたエージェントは通常のカスタムエージェントとして扱う）
        isShared: undefined,
        organizationId: undefined
      }
      saveCustomAgents([...customAgents, newAgent])
    },
    [customAgents, saveCustomAgents, t]
  )

  const saveAsShared = useCallback(
    async (agent: CustomAgent) => {
      try {
        const result = await window.file.saveSharedAgent(agent)
        if (result.success) {
          // Load the updated shared agents to refresh the list in the UI
          await loadSharedAgents()
          toast.success(t('agentSavedAsShared'), { duration: 5000 })
        } else {
          console.error('Failed to save agent as shared file:', result.error)
          toast.error(result.error || t('failedToSaveShared'))
        }
      } catch (error) {
        console.error('Error saving shared agent:', error)
        toast.error(t('failedToSaveShared'))
      }
    },
    [loadSharedAgents, t]
  )

  const convertToStrands = useCallback(async (agentId: string) => {
    try {
      const directory = await window.api.openDirectory()
      if (!directory) {
        return // User cancelled directory selection
      }

      const loadingToast = toast.loading('Converting agent to Strands Agents...')
      const result = await window.api.strandsConverter.convertAndSave(agentId, directory)
      toast.dismiss(loadingToast)

      if (result.success) {
        toast.success(`Strands Agents files saved to ${directory}`, { duration: 5000 })
      } else {
        toast.error(result.error || 'Failed to convert agent to Strands Agents')
        console.error('Conversion failed:', result.errors)
      }
    } catch (error) {
      console.error('Error converting agent to Strands Agents:', error)
      toast.error('Failed to convert agent to Strands Agents')
    }
  }, [])

  return { saveAgent, deleteAgent, duplicateAgent, saveAsShared, convertToStrands }
}
