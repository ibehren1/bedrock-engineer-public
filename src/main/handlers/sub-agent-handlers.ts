import { IpcMainInvokeEvent } from 'electron'
import { createCategoryLogger } from '../../common/logger'
import {
  SubAgentRunner,
  type SubAgentInvokeParams
} from '../api/bedrock/services/subAgent/SubAgentRunner'
import { getBackgroundAgentService } from './background-agent-handlers'

const logger = createCategoryLogger('sub-agent:ipc')

// Background Agent と同じサービスインスタンスを共有する
// （インスタンスを増やすとセッションメタデータのストアが競合する）
let subAgentRunner: SubAgentRunner | null = null

function getSubAgentRunner(): SubAgentRunner {
  if (!subAgentRunner) {
    subAgentRunner = new SubAgentRunner(getBackgroundAgentService)
  }
  return subAgentRunner
}

export const subAgentHandlers = {
  'sub-agent:invoke': async (_event: IpcMainInvokeEvent, params: SubAgentInvokeParams) => {
    logger.debug('Sub-agent invoke request', {
      callerAgentId: params.callerAgentId,
      agentId: params.agentId,
      depth: params.depth,
      allowedAgentIds: params.allowedAgentIds
    })

    // ポリシー違反や実行エラーはそのまま throw する。
    // preload 側の InvokeAgentTool が投げ直し、呼び出し元のツール結果が error になる
    return await getSubAgentRunner().invoke(params)
  }
}
