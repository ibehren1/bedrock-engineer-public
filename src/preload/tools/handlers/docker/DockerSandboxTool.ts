/**
 * DockerSandbox tool implementation
 *
 * Manages a long-lived, chat-scoped Docker container (or compose stack) that
 * `executeCommand` runs inside. All Docker work happens in the main process; this tool is
 * a thin, validating front end over that IPC surface.
 */

import { Tool } from '@aws-sdk/client-bedrock-runtime'
import { ipcRenderer } from 'electron'
import { BaseTool } from '../../base/BaseTool'
import { ValidationResult } from '../../base/types'
import { ExecutionError } from '../../base/errors'
import { DockerSandboxInput, ToolResult } from '../../../../types/tools'

interface DockerSandboxResult extends ToolResult {
  name: 'dockerSandbox'
}

/**
 * Session id resolution. The chat loop passes it as the second argument to executeTool
 * (see useAgentChat), and the background-agent bridge injects it into the input instead
 * because that path carries no context object.
 */
export const resolveSessionId = (input: any, context?: any): string | undefined =>
  context?.sessionId || input?._sessionId

export class DockerSandboxTool extends BaseTool<any, DockerSandboxResult> {
  static readonly toolName = 'dockerSandbox'
  static readonly toolDescription = `Manage this chat's isolated Docker sandbox — a long-lived container built on ubuntu:26.04 where you can install anything without touching the user's machine.

The sandbox is created automatically the first time you run executeCommand, so you usually do not need the "create" operation. Use "create" only to define a multi-service stack, publish ports, or rebuild from scratch.

Key facts:
- The user's project directory ({{projectPath}}) is mounted read-write at /workspace, so files move freely in and out.
- The image is bare Ubuntu: run "apt-get update" before installing anything. DEBIAN_FRONTEND=noninteractive is already set.
- The container has network access, so apt/pip/npm work.
- Nothing is preinstalled — not even curl or git.
- Data written to /data persists on the host under the sandbox folder.
- To make a port reachable from the user's browser, declare it with "create" before starting the server.

Operations:
- create: create or rebuild the sandbox. Optionally pass "services" (structured) or "composeYaml" (raw compose). Named volumes are converted to mapped folders; host mounts outside the project directory, "privileged", "cap_add", and host networking are rejected.
- status: report whether the sandbox exists, whether it is running, and its services and published ports.
- start / stop: bring the sandbox up or halt it without discarding installed packages.
- remove: tear the sandbox down. Pass deleteData: true to also delete its data folder.
- logs: read recent output from a service, which is how you inspect a process started with executeCommand's detach option.`

  readonly name = DockerSandboxTool.toolName
  readonly description = DockerSandboxTool.toolDescription

  static readonly toolSpec: Tool['toolSpec'] = {
    name: DockerSandboxTool.toolName,
    description: DockerSandboxTool.toolDescription,
    inputSchema: {
      json: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['create', 'status', 'start', 'stop', 'remove', 'logs'],
            description: 'The sandbox operation to perform'
          },
          services: {
            type: 'array',
            description:
              'Structured service definitions, used with create. Omit for a single bare ubuntu:26.04 service.',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Service name (lowercase letters, digits, dashes, underscores)'
                },
                image: {
                  type: 'string',
                  description: 'Container image. Defaults to ubuntu:26.04.'
                },
                command: {
                  type: 'string',
                  description:
                    'Container command. Defaults to "sleep infinity" so the container stays available for exec.'
                },
                ports: {
                  type: 'array',
                  description: 'Ports to publish on the host so the user can reach the service.',
                  items: {
                    type: 'object',
                    properties: {
                      host: { type: 'number', description: 'Port on the host' },
                      container: { type: 'number', description: 'Port inside the container' }
                    },
                    required: ['host', 'container']
                  }
                },
                environment: {
                  type: 'object',
                  description: 'Environment variables for the service'
                },
                dataVolumes: {
                  type: 'array',
                  description:
                    'Extra persistent folders. Each maps the sandbox data directory to a container path.',
                  items: {
                    type: 'object',
                    properties: {
                      name: {
                        type: 'string',
                        description: 'Folder name under the sandbox data dir'
                      },
                      containerPath: { type: 'string', description: 'Mount point in the container' }
                    },
                    required: ['name', 'containerPath']
                  }
                }
              },
              required: ['name']
            }
          },
          composeYaml: {
            type: 'string',
            description:
              'Raw docker-compose YAML, used with create for stacks the structured form cannot express. Validated and rewritten before use.'
          },
          env: {
            type: 'object',
            description: 'Extra variables written to the sandbox .env file, used with create.'
          },
          recreate: {
            type: 'boolean',
            description:
              'With create, tear down the existing sandbox first. Installed packages are lost.'
          },
          deleteData: {
            type: 'boolean',
            description:
              'With remove, also delete the sandbox data folder on the host. Defaults to false.'
          },
          service: {
            type: 'string',
            description: 'With logs, which service to read. Defaults to the first service.'
          },
          tail: {
            type: 'number',
            description: 'With logs, how many trailing lines to return. Defaults to 200.'
          }
        },
        required: ['operation']
      }
    }
  } as const

  protected validateInput(input: any): ValidationResult {
    const errors: string[] = []
    const validOperations = ['create', 'status', 'start', 'stop', 'remove', 'logs']

    if (!input.operation) {
      errors.push(`Operation is required. One of: ${validOperations.join(', ')}`)
    } else if (!validOperations.includes(input.operation)) {
      errors.push(`Unknown operation "${input.operation}". One of: ${validOperations.join(', ')}`)
    }

    if (input.operation === 'create') {
      if (input.composeYaml !== undefined && typeof input.composeYaml !== 'string') {
        errors.push('composeYaml must be a string')
      }
      if (input.services !== undefined && !Array.isArray(input.services)) {
        errors.push('services must be an array')
      }
      if (input.composeYaml && input.services) {
        errors.push('Pass either services or composeYaml, not both')
      }
    }

    if (input.operation === 'logs' && input.tail !== undefined) {
      if (typeof input.tail !== 'number' || input.tail <= 0) {
        errors.push('tail must be a positive number')
      }
    }

    return { isValid: errors.length === 0, errors }
  }

  protected async executeInternal(
    input: DockerSandboxInput & { _sessionId?: string },
    context?: any
  ): Promise<DockerSandboxResult> {
    const sessionId = resolveSessionId(input, context)

    if (!sessionId) {
      throw new ExecutionError(
        'The Docker sandbox is scoped to a chat session, and no session is available in this context. Voice chat does not support sandboxes — run commands with target: "host" instead.',
        this.name
      )
    }

    try {
      switch (input.operation) {
        case 'create': {
          const { metadata, warnings } = await ipcRenderer.invoke('docker-sandbox-create', {
            sessionId,
            options: {
              services: input.services,
              composeYaml: input.composeYaml,
              env: input.env,
              recreate: input.recreate
            }
          })

          this.logger.info('Sandbox created via tool', {
            sessionId,
            services: metadata.services?.map((s: any) => s.name)
          })

          return this.result({
            created: true,
            projectName: metadata.projectName,
            directory: metadata.directory,
            workspaceMount: '/workspace',
            services: metadata.services,
            composeless: metadata.composeless,
            warnings,
            note: 'The image is bare Ubuntu. Run "apt-get update" before installing packages.'
          })
        }

        case 'status': {
          const status = await ipcRenderer.invoke('docker-sandbox-status', { sessionId })
          return this.result(status)
        }

        case 'start': {
          const status = await ipcRenderer.invoke('docker-sandbox-start', { sessionId })
          return this.result(status)
        }

        case 'stop': {
          const status = await ipcRenderer.invoke('docker-sandbox-stop', { sessionId })
          return this.result(status)
        }

        case 'remove': {
          const result = await ipcRenderer.invoke('docker-sandbox-remove', {
            sessionId,
            options: { deleteData: input.deleteData === true }
          })
          return this.result(result)
        }

        case 'logs': {
          const logs = await ipcRenderer.invoke('docker-sandbox-logs', {
            sessionId,
            service: input.service,
            tail: input.tail
          })
          return this.result(logs)
        }

        default: {
          // The validator rejects unknown operations, so this is unreachable in practice.
          throw new ExecutionError(`Unsupported operation: ${(input as any).operation}`, this.name)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)

      this.logger.error('Sandbox operation failed', {
        sessionId,
        operation: (input as any).operation,
        error: message
      })

      throw new ExecutionError(message, this.name, error instanceof Error ? error : undefined, {
        operation: (input as any).operation
      })
    }
  }

  private result(payload: any): DockerSandboxResult {
    return {
      success: true,
      name: 'dockerSandbox',
      message: 'Docker sandbox operation completed',
      result: payload
    }
  }
}
