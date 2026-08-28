/**
 * Tool to delegate a task to another configured agent
 */

import { z } from 'zod'
import { Tool } from '@aws-sdk/client-bedrock-runtime'
import { BaseTool, zodToJsonSchemaBody } from '../../base/BaseTool'
import { ValidationResult } from '../../base/types'
import { InvokeAgentInput, InvokeAgentResult } from '../../../../types/tools'
import { api } from '../../../api'

/**
 * Input schema for agent delegation
 *
 * Note: the caller narrows `agentId` to an enum of permitted ids before this
 * spec reaches the model. The enum is a hint only — main enforces the allowlist.
 */
const invokeAgentInputSchema = z.object({
  type: z.literal('invokeAgent'),
  agentId: z
    .string()
    .min(1)
    .describe(
      'The id of the agent to delegate to. Must be one of the ids listed in this tool description. Do not guess ids.'
    ),
  task: z
    .string()
    .min(1)
    .describe(
      'A complete, self-contained instruction for the sub-agent. The sub-agent does NOT see this conversation, so restate every fact, path, and constraint it needs. Describe the outcome you want, not the tools to use.'
    ),
  context: z
    .string()
    .optional()
    .describe('Optional background: relevant file paths, prior findings, decisions already made.'),
  expectedOutput: z
    .string()
    .optional()
    .describe('Optional description of the shape or format of the answer you want back.')
})

/**
 * Tool to delegate a task to another configured agent
 */
export class InvokeAgentTool extends BaseTool<InvokeAgentInput, InvokeAgentResult> {
  readonly name = 'invokeAgent'
  readonly description = 'Delegate a self-contained task to another configured agent'

  /**
   * AWS Bedrock tool specification
   */
  static readonly toolSpec: Tool['toolSpec'] = {
    name: 'invokeAgent',
    description: `Delegate a self-contained task to another configured agent and wait for its answer.

The sub-agent runs to completion with its own system prompt and its own tool set, then returns its final text. This call blocks until it finishes.

## When to delegate

1. The task needs expertise or a persona that another agent is configured for
2. The task is a large, separable chunk of work with a clear deliverable
3. The user explicitly asked for a specific agent to handle part of the request

## When NOT to delegate

1. You can do the work yourself with the tools you already have — delegation costs extra time and tokens
2. The task needs the full conversation history for context; the sub-agent cannot see it
3. The task is a single tool call

## Writing a good task

The sub-agent starts from nothing. It sees only what you write in \`task\`, \`context\`, and \`expectedOutput\` — not this conversation, not the user's original message, not your earlier tool results. Restate every file path, identifier, constraint, and decision it needs. Describe the outcome you want rather than the steps to take, and let the sub-agent choose its own tools.

## Limits

- Delegation is limited in depth, so a sub-agent may not be able to delegate further
- A sub-agent may only be invoked when the user has permitted it (see the list below, if present)
- If the sub-agent hits its tool budget you receive its partial answer with \`stoppedReason: "maxToolExecutions"\``,
    inputSchema: {
      json: zodToJsonSchemaBody(invokeAgentInputSchema)
    }
  }

  /**
   * Validate input parameters
   */
  protected validateInput(input: InvokeAgentInput): ValidationResult {
    try {
      invokeAgentInputSchema.parse(input)
      return { isValid: true, errors: [] }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          isValid: false,
          errors: error.errors.map((e) => `${e.path.join('.')}: ${e.message}`)
        }
      }
      return {
        isValid: false,
        errors: ['Invalid input format']
      }
    }
  }

  /**
   * Execute the tool
   *
   * Throws on hard failures so the caller records the tool result as an error;
   * the renderer's result mapping treats any returned object as a success.
   */
  protected async executeInternal(input: InvokeAgentInput): Promise<InvokeAgentResult> {
    const { agentId, task, context, expectedOutput } = input

    // 委譲メタデータは呼び出し側が注入する。モデルは生成しない
    const depth = input._delegationDepth ?? 0
    const lineage = input._delegationLineage ?? (input._agentId ? [input._agentId] : [])
    const allowedAgentIds = input._allowedAgentIds ?? []

    this.logger.info('Delegating task to agent', {
      agentId,
      callerAgentId: input._agentId,
      depth,
      taskPreview: this.truncateForLogging(task, 200)
    })

    const result = await api.subAgent.invoke({
      agentId,
      task,
      context,
      expectedOutput,
      callerAgentId: input._agentId,
      depth,
      lineage,
      allowedAgentIds,
      projectDirectory: this.store.get('projectPath'),
      modelId: input._modelId
    })

    this.logger.info('Delegation completed', {
      agentId,
      depth: result.depth,
      durationMs: result.durationMs,
      toolCallCount: result.toolCallCount,
      stoppedReason: result.stoppedReason
    })

    return {
      name: 'invokeAgent',
      success: true,
      message: `Agent "${result.agentName}" completed the task in ${Math.round(result.durationMs / 1000)}s using ${result.toolCallCount} tool call(s)`,
      result
    }
  }

  protected sanitizeInputForLogging(input: InvokeAgentInput): any {
    return {
      type: input.type,
      agentId: input.agentId,
      task: this.truncateForLogging(input.task || '', 200),
      hasContext: !!input.context,
      hasExpectedOutput: !!input.expectedOutput,
      _delegationDepth: input._delegationDepth,
      _delegationLineage: input._delegationLineage
    }
  }
}
