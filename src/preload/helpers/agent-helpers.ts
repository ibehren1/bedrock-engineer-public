import { store } from '../store'
import { CustomAgent } from '../../types/agent-chat'

/**
 * カスタムエージェントと共有エージェントを組み合わせて返す関数
 * 注: directoryAgentsは含まれません
 */
export function getAllAgents(): CustomAgent[] {
  const customAgents = store.get('customAgents') || []
  const sharedAgents = store.get('sharedAgents') || []
  return [...customAgents, ...sharedAgents]
}

/**
 * IDを指定してエージェントを検索する関数
 * カスタムエージェントと共有エージェントから検索します
 */
export function findAgentById(agentId: string): CustomAgent | undefined {
  return getAllAgents().find((agent) => agent.id === agentId)
}
