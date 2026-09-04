/**
 * ExecuteCommand tool implementation
 */

import { Tool } from '@aws-sdk/client-bedrock-runtime'
import { ipcRenderer } from 'electron'
import { BaseTool } from '../../base/BaseTool'
import { ValidationResult } from '../../base/types'
import { ExecutionError, PermissionDeniedError } from '../../base/errors'
import { ToolResult } from '../../../../types/tools'
import { CommandService } from '../../../../main/api/command/commandService'
import {
  CommandInput,
  CommandStdinInput,
  ProcessInfo,
  CommandConfig,
  CommandPatternConfig
} from '../../../../main/api/command/types'
import { findAgentById } from '../../../helpers/agent-helpers'
import { resolveSessionId } from '../docker'

/** Extra fields accepted alongside a command, for sandbox routing. */
type SandboxRouting = {
  target?: 'sandbox' | 'host'
  service?: string
  detach?: boolean
}

/**
 * Input type for ExecuteCommandTool
 */
type ExecuteCommandInput = {
  type: 'executeCommand'
  _agentId?: string // BackgroundAgentService用のメタデータ
  _sessionId?: string // BackgroundAgentService用のセッションID（context を持たない経路向け）
} & ((CommandInput & SandboxRouting) | CommandStdinInput)

/**
 * Result type for ExecuteCommandTool
 */
interface ExecuteCommandResult extends ToolResult {
  name: 'executeCommand'
  stdout: string
  stderr: string
  exitCode: number
  processInfo?: ProcessInfo
  requiresInput?: boolean
  prompt?: string
}

/**
 * Command service state management
 */
interface CommandServiceState {
  service: CommandService
  config: CommandConfig
}

let commandServiceState: CommandServiceState | null = null

/**
 * Tool for executing system commands
 */
export class ExecuteCommandTool extends BaseTool<ExecuteCommandInput, ExecuteCommandResult> {
  static readonly toolName = 'executeCommand'
  static readonly toolDescription =
    'Execute a command or send input to a running process. First execute the command to get a PID, then use that PID to send input if needed. Usage: 1) First call with command and cwd to start process, 2) If input is required, call again with pid and stdin.\n\nWhen the dockerSandbox tool is enabled, commands run inside this chat\'s isolated Docker container by default and any command is permitted there — the sandbox is created automatically on first use. The project directory ({{projectPath}}) is mounted at /workspace, so use /workspace paths for cwd. The sandbox is bare Ubuntu, so run "apt-get update" before installing packages.\n\nSet target: "host" to run on the user\'s own machine instead. Host commands require the user to approve them, and only commands from this allowed list may be used: {{allowedCommands}}. Prefer the sandbox unless the task genuinely needs the host (for example git operations on the real repository).\n\nSet detach: true to start a long-running process in the background and return immediately; read its output later with the dockerSandbox logs operation.'

  readonly name = ExecuteCommandTool.toolName
  readonly description = ExecuteCommandTool.toolDescription

  /**
   * AWS Bedrock tool specification
   */
  static readonly toolSpec: Tool['toolSpec'] = {
    name: ExecuteCommandTool.toolName,
    description: ExecuteCommandTool.toolDescription,
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to execute (used when starting a new process)'
          },
          cwd: {
            type: 'string',
            description: 'The working directory for the command execution (used with command)'
          },
          pid: {
            type: 'number',
            description: 'Process ID to send input to (used when sending input to existing process)'
          },
          stdin: {
            type: 'string',
            description: 'Standard input to send to the process (used with pid)'
          },
          target: {
            type: 'string',
            enum: ['sandbox', 'host'],
            description:
              'Where to run the command. Defaults to the chat\'s Docker sandbox when that tool is enabled. Use "host" only when the task requires the user\'s own machine; the user must approve each host command.'
          },
          service: {
            type: 'string',
            description:
              "Sandbox service to run the command in. Defaults to the sandbox's first service. Ignored on the host."
          },
          detach: {
            type: 'boolean',
            description:
              'Start the command in the background and return immediately. Use for dev servers and other long-running processes, then read output with the dockerSandbox logs operation. Sandbox only.'
          }
        }
      }
    }
  } as const

  /**
   * Get or create command service instance
   */
  private getCommandService(config: CommandConfig): CommandService {
    // Check if we need to create a new instance
    if (
      !commandServiceState ||
      JSON.stringify(commandServiceState.config) !== JSON.stringify(config)
    ) {
      commandServiceState = {
        service: new CommandService(config),
        config
      }
    }
    return commandServiceState.service
  }

  /**
   * Validate input
   */
  protected validateInput(input: ExecuteCommandInput): ValidationResult {
    const errors: string[] = []

    // Check if it's stdin input
    if ('pid' in input && 'stdin' in input) {
      if (typeof input.pid !== 'number') {
        errors.push('PID must be a number')
      }
      if (input.stdin !== undefined && typeof input.stdin !== 'string') {
        errors.push('Stdin must be a string')
      }
    }
    // Check if it's command input
    else if ('command' in input && 'cwd' in input) {
      if (!input.command) {
        errors.push('Command is required')
      }
      if (typeof input.command !== 'string') {
        errors.push('Command must be a string')
      }
      if (!input.cwd) {
        errors.push('Working directory (cwd) is required')
      }
      if (typeof input.cwd !== 'string') {
        errors.push('Working directory must be a string')
      }
    } else {
      errors.push('Invalid input format: requires either (command, cwd) or (pid, stdin)')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  /**
   * Decide whether this invocation runs in the chat's Docker sandbox.
   *
   * The sandbox is used when the agent has the dockerSandbox tool enabled and a chat
   * session is available. Voice chat carries no session id, so it always falls back to
   * the host path with its allowlist.
   */
  private resolveSandboxSession(input: ExecuteCommandInput, context?: any): string | undefined {
    if ('target' in input && input.target === 'host') {
      return undefined
    }

    const agentId = input?._agentId || (this.store.get('selectedAgentId') as string | undefined)
    if (!agentId) return undefined

    const agent = findAgentById(agentId)
    if (!agent?.tools?.includes('dockerSandbox')) return undefined

    return resolveSessionId(input, context)
  }

  /**
   * Run a command inside the chat's sandbox via the main-process service.
   */
  private async executeInSandbox(
    sessionId: string,
    input: ExecuteCommandInput & { command: string; cwd: string } & SandboxRouting
  ): Promise<ExecuteCommandResult> {
    this.logger.info('Executing command in Docker sandbox', {
      sessionId,
      command: this.truncateForLogging(input.command, 100),
      service: input.service,
      detach: input.detach
    })

    const result = await ipcRenderer.invoke('docker-sandbox-exec', {
      sessionId,
      command: input.command,
      options: {
        service: input.service,
        // The model is told to use /workspace paths, but a host-shaped cwd would be
        // meaningless inside the container, so anything outside /workspace is ignored.
        cwd: input.cwd?.startsWith('/') ? input.cwd : undefined,
        detach: input.detach
      }
    })

    return {
      success: true,
      name: 'executeCommand',
      message: `Command executed in sandbox: ${input.command}`,
      result: {
        target: 'sandbox',
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        processInfo: result.processInfo,
        requiresInput: result.requiresInput,
        prompt: result.prompt,
        detached: result.detached
      },
      ...result
    }
  }

  /**
   * Execute the tool
   */
  protected async executeInternal(
    input: ExecuteCommandInput,
    context?: any
  ): Promise<ExecuteCommandResult> {
    // stdin follow-ups have to reach whichever executor owns the PID. Sandbox PIDs are
    // tracked in the main process, host PIDs in CommandService.
    if ('pid' in input && 'stdin' in input) {
      const { tracked } = await ipcRenderer.invoke('docker-sandbox-has-pid', { pid: input.pid })
      if (tracked) {
        this.logger.info('Sending stdin to sandbox process', { pid: input.pid })

        const result = await ipcRenderer.invoke('docker-sandbox-send-input', {
          pid: input.pid,
          stdin: input.stdin
        })

        return {
          success: true,
          name: 'executeCommand',
          message: `Sent input to sandbox process ${input.pid}`,
          result: {
            target: 'sandbox',
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode,
            processInfo: result.processInfo,
            requiresInput: result.requiresInput,
            prompt: result.prompt
          },
          ...result
        }
      }
    } else if ('command' in input && 'cwd' in input) {
      const sessionId = this.resolveSandboxSession(input, context)
      if (sessionId) {
        try {
          return await this.executeInSandbox(sessionId, input as any)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          this.logger.error('Sandbox command failed', { sessionId, error: message })
          throw new ExecutionError(message, this.name, error instanceof Error ? error : undefined, {
            input
          })
        }
      }
    }

    // Get command configuration
    const config = this.getCommandConfig(input)

    this.logger.debug('Executing command', {
      input: JSON.stringify(input),
      config: JSON.stringify({
        allowedCommands: config.allowedCommands?.length || 0
      })
    })

    try {
      const commandService = this.getCommandService(config)
      let result

      if ('stdin' in input && 'pid' in input) {
        // Send stdin to existing process
        this.logger.info('Sending stdin to process', {
          pid: input.pid,
          stdinLength: input.stdin?.length || 0
        })

        result = await commandService.sendInput(input)

        this.logger.debug('Process stdin result', {
          pid: input.pid,
          exitCode: result.exitCode,
          hasStdout: !!result.stdout.length,
          hasStderr: !!result.stderr.length
        })
      } else if ('command' in input && 'cwd' in input) {
        // Execute new command
        this.logger.info('Executing new command', {
          command: input.command,
          cwd: input.cwd
        })

        result = await commandService.executeCommand(input)

        this.logger.debug('Command execution result', {
          pid: result.processInfo?.pid,
          exitCode: result.exitCode,
          hasStdout: !!result.stdout.length,
          hasStderr: !!result.stderr.length,
          requiresInput: result.requiresInput
        })
      } else {
        const errorMsg = 'Invalid input format'
        this.logger.warn(errorMsg, { input: JSON.stringify(input) })
        throw new Error(errorMsg)
      }

      this.logger.info('Command execution completed', {
        exitCode: result.exitCode,
        success: result.exitCode === 0,
        requiresInput: result.requiresInput || false
      })

      return {
        success: true,
        name: 'executeCommand',
        message: `Command executed: ${JSON.stringify(input)}`,
        result: {
          target: 'host',
          stdout: result.stdout,
          stderr: result.stderr,
          exitCode: result.exitCode,
          processInfo: result.processInfo,
          requiresInput: result.requiresInput,
          prompt: result.prompt
        },
        ...result
      }
    } catch (error) {
      this.logger.error('Error executing command', {
        error: error instanceof Error ? error.message : 'Unknown error',
        input: JSON.stringify(input)
      })

      // Check if it's a permission error
      if (error instanceof Error && error.message.includes('not allowed')) {
        throw new PermissionDeniedError(
          error.message,
          this.name,
          'command' in input ? input.command : 'stdin'
        )
      }

      throw new ExecutionError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        this.name,
        error instanceof Error ? error : undefined,
        { input }
      )
    }
  }

  /**
   * Get command configuration from store
   */
  private getCommandConfig(input?: ExecuteCommandInput): CommandConfig {
    // Get basic shell setting
    const shell = (this.store.get('shell') as string) || '/bin/bash'

    // Get agent ID - prioritize _agentId from BackgroundAgentService, fallback to selectedAgentId
    const agentId = input?._agentId || (this.store.get('selectedAgentId') as string | undefined)

    // Get agent-specific allowed commands
    let allowedCommands: CommandPatternConfig[] = []

    if (agentId) {
      // Find agent and get allowed commands
      const currentAgent = findAgentById(agentId)
      if (currentAgent && currentAgent.allowedCommands) {
        // Convert to CommandPatternConfig format
        allowedCommands = currentAgent.allowedCommands.map((cmd) => ({
          pattern: cmd.pattern,
          description: cmd.description || ''
        }))
      }

      this.logger.debug('Found agent configuration', {
        agentId,
        agentName: currentAgent?.name,
        allowedCommandsCount: allowedCommands.length,
        isFromBackgroundAgent: !!input?._agentId
      })
    } else {
      this.logger.warn('No agent ID found for command configuration', {
        hasInputAgentId: !!input?._agentId,
        hasSelectedAgentId: !!this.store.get('selectedAgentId')
      })
    }

    return {
      allowedCommands,
      shell
    }
  }

  /**
   * Override to return error as JSON string for compatibility
   */
  protected handleError(error: unknown): Error {
    const toolError = super.handleError(error) as Error

    // For this tool, we need to return a JSON string error
    return new Error(
      JSON.stringify({
        success: false,
        error: toolError.message
      })
    )
  }

  /**
   * Override to sanitize command for logging
   */
  protected sanitizeInputForLogging(input: ExecuteCommandInput): any {
    if ('command' in input) {
      return {
        ...input,
        command: this.truncateForLogging(input.command, 100)
      }
    }

    if ('stdin' in input) {
      return {
        ...input,
        stdin: input.stdin ? this.truncateForLogging(input.stdin, 50) : undefined
      }
    }

    return input
  }
}
