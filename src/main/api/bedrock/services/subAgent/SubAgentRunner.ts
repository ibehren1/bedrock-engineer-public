/**
 * Policy layer for agent-to-agent delegation (the `invokeAgent` tool).
 *
 * `BackgroundAgentService` already knows how to run an agent headlessly; this
 * class owns everything specific to *delegation*: allowlist / lineage / depth
 * validation, ephemeral session lifecycle, wall-clock timeout, concurrency
 * limits, and reducing a full run down to the flat result the calling model
 * sees.
 */

import { store } from '../../../../../preload/store'
import { createCategoryLogger } from '../../../../../common/logger'
import {
  canDelegate,
  filterDelegationTargets,
  MAX_DELEGATION_DEPTH,
  MAX_DELEGATION_RESULT_CHARS
} from '../../../../../common/agents/delegation'
import type { InvokeAgentResult } from '../../../../../types/tools'
import type { BackgroundAgentService } from '../backgroundAgent/BackgroundAgentService'
import type { BackgroundAgentConfig, BackgroundChatResult } from '../backgroundAgent/types'

const logger = createCategoryLogger('sub-agent')

/** Wall clock for one delegation. One inner tool can legitimately take 300s. */
export const SUB_AGENT_TIMEOUT_MS = 10 * 60 * 1000

/** Tool budget for one delegation. The engine default of 500 is far too high for a blocking call. */
export const SUB_AGENT_MAX_TOOL_EXECUTIONS = 30

/** Concurrent delegations. The caller can fan out tool calls, and each one costs money. */
export const SUB_AGENT_MAX_CONCURRENT = 2

export type SubAgentInvokeParams = {
  agentId: string
  task: string
  context?: string
  expectedOutput?: string
  callerAgentId?: string
  /** Depth of the *caller*. 0 = top-level chat. */
  depth: number
  /** Agent ids from the root down to and including the caller. */
  lineage: string[]
  allowedAgentIds: string[]
  projectDirectory?: string
  modelId?: string
  options?: {
    maxToolExecutions?: number
    timeoutMs?: number
  }
}

export type SubAgentInvokeResult = InvokeAgentResult['result'] & {
  success: boolean
  error?: string
}

/** Raised for policy violations, so the handler can report them verbatim to the model. */
export class SubAgentPolicyError extends Error {}

export class SubAgentRunner {
  private activeCount = 0
  /** Sessions whose run outlived our timeout; their files are deleted again once the run settles. */
  private abandonedSessions = new Set<string>()

  constructor(private readonly getService: () => BackgroundAgentService) {}

  async invoke(params: SubAgentInvokeParams): Promise<SubAgentInvokeResult> {
    const service = this.getService()
    const startedAt = Date.now()

    const permitted = filterDelegationTargets(
      params.allowedAgentIds || [],
      params.lineage || [],
      params.callerAgentId
    )

    if (!canDelegate(params.depth, permitted.length)) {
      if (params.depth >= MAX_DELEGATION_DEPTH) {
        throw new SubAgentPolicyError(
          `Delegation depth limit reached (max ${MAX_DELEGATION_DEPTH}). Complete this task yourself.`
        )
      }
      throw new SubAgentPolicyError(
        'No agents are permitted for delegation in this request. The user must @mention an agent first.'
      )
    }

    if (!permitted.includes(params.agentId)) {
      if ((params.lineage || []).includes(params.agentId)) {
        throw new SubAgentPolicyError(
          `Delegation loop blocked: "${params.agentId}" is already in the caller chain (${params.lineage.join(' -> ')}).`
        )
      }
      throw new SubAgentPolicyError(
        `agentId "${params.agentId}" is not permitted in this request. The user must @mention it. Permitted: ${permitted.join(', ')}.`
      )
    }

    const agent = await service
      .getAllAgents()
      .then((all) => all.find((a) => a.id === params.agentId))
    if (!agent) {
      throw new SubAgentPolicyError(`Agent not found: ${params.agentId}`)
    }

    if (this.activeCount >= SUB_AGENT_MAX_CONCURRENT) {
      throw new SubAgentPolicyError(
        `Too many concurrent delegations (max ${SUB_AGENT_MAX_CONCURRENT}). Retry after the current ones finish.`
      )
    }

    // 呼び出し側と同じモデルで動かす。未指定なら設定中のモデルにフォールバックする
    const modelId = params.modelId || store.get('llm')?.modelId
    if (!modelId) {
      throw new SubAgentPolicyError(
        'No model is configured, so the sub-agent cannot be started. Select a model in settings.'
      )
    }

    const depth = params.depth + 1
    const sessionId = `subagent-${params.callerAgentId || 'chat'}-${params.agentId}-${startedAt}-${this.activeCount}`
    const timeoutMs = params.options?.timeoutMs ?? SUB_AGENT_TIMEOUT_MS
    const maxToolExecutions = params.options?.maxToolExecutions ?? SUB_AGENT_MAX_TOOL_EXECUTIONS

    const config: BackgroundAgentConfig = {
      modelId,
      agentId: params.agentId,
      projectDirectory: params.projectDirectory,
      delegationDepth: depth,
      delegationLineage: [...(params.lineage || []), params.agentId],
      allowedDelegationAgentIds: permitted
    }

    this.activeCount++
    try {
      await service.createSession(sessionId, {
        agentId: params.agentId,
        modelId,
        projectDirectory: params.projectDirectory
      })

      logger.info('Delegating to sub-agent', {
        sessionId,
        callerAgentId: params.callerAgentId,
        agentId: params.agentId,
        agentName: agent.name,
        depth,
        modelId,
        taskLength: params.task.length
      })

      const chatPromise = service.chat(sessionId, config, buildPrompt(params), {
        enableToolExecution: true,
        maxToolExecutions,
        timeoutMs
      })

      // Promise.race はキャンセルではないため、タイムアウト後も chat() は動き続ける。
      // 孤児となった実行が終わったらセッションを再削除する（addMessage が再作成するため）
      const result = await this.raceWithTimeout(chatPromise, timeoutMs, sessionId, params)

      const durationMs = Date.now() - startedAt
      const finalText = extractText(result)
      const toolNames = distinctToolNames(result)
      const stoppedReason: SubAgentInvokeResult['stoppedReason'] =
        (result.toolExecutions?.length || 0) >= maxToolExecutions
          ? 'maxToolExecutions'
          : 'completed'

      logger.info('Sub-agent completed', {
        sessionId,
        agentId: params.agentId,
        depth,
        durationMs,
        toolCallCount: result.toolExecutions?.length || 0,
        stoppedReason,
        finalTextLength: finalText.length
      })

      return {
        success: true,
        agentId: params.agentId,
        agentName: agent.name,
        agentIcon: agent.icon,
        agentIconColor: agent.iconColor,
        task: params.task,
        finalText:
          finalText.length > MAX_DELEGATION_RESULT_CHARS
            ? finalText.slice(0, MAX_DELEGATION_RESULT_CHARS)
            : finalText || '(the sub-agent produced no text output)',
        truncated: finalText.length > MAX_DELEGATION_RESULT_CHARS || undefined,
        toolCallCount: result.toolExecutions?.length || 0,
        toolNames,
        durationMs,
        depth,
        stoppedReason,
        sessionId
      }
    } finally {
      this.activeCount--
      if (!this.abandonedSessions.has(sessionId)) {
        service.deleteSession(sessionId)
      }
    }
  }

  private raceWithTimeout(
    chatPromise: Promise<BackgroundChatResult>,
    timeoutMs: number,
    sessionId: string,
    params: SubAgentInvokeParams
  ): Promise<BackgroundChatResult> {
    let timer: NodeJS.Timeout | undefined

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        this.abandonedSessions.add(sessionId)

        // 孤児の実行が終わったタイミングでセッションを削除し直す
        chatPromise
          .catch(() => undefined)
          .finally(() => {
            this.abandonedSessions.delete(sessionId)
            try {
              this.getService().deleteSession(sessionId)
            } catch (error: any) {
              logger.warn('Failed to clean up abandoned sub-agent session', {
                sessionId,
                error: error?.message
              })
            }
          })

        reject(
          new SubAgentPolicyError(
            `Sub-agent "${params.agentId}" timed out after ${Math.round(timeoutMs / 1000)}s. Narrow the task and retry.`
          )
        )
      }, timeoutMs)
    })

    return Promise.race([chatPromise, timeoutPromise]).finally(() => {
      if (timer) clearTimeout(timer)
    }) as Promise<BackgroundChatResult>
  }
}

/**
 * The sub-agent does not see the caller's conversation, so everything it needs
 * has to be in this one message.
 */
function buildPrompt(params: SubAgentInvokeParams): string {
  const sections = [params.task.trim()]

  if (params.context?.trim()) {
    sections.push(`## Context\n\n${params.context.trim()}`)
  }
  if (params.expectedOutput?.trim()) {
    sections.push(`## Expected output\n\n${params.expectedOutput.trim()}`)
  }

  return sections.join('\n\n')
}

function extractText(result: BackgroundChatResult): string {
  return (result.response?.content || [])
    .map((block: any) => (typeof block?.text === 'string' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim()
}

function distinctToolNames(result: BackgroundChatResult): string[] {
  const names: string[] = []
  for (const execution of result.toolExecutions || []) {
    if (execution.toolName && !names.includes(execution.toolName)) {
      names.push(execution.toolName)
    }
  }
  return names
}
