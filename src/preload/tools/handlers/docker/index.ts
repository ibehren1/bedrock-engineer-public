/**
 * Docker sandbox tool exports
 */

import { ToolDependencies, ToolCategory } from '../../base/types'
import { DockerSandboxTool } from './DockerSandboxTool'

export function createDockerSandboxTools(dependencies: ToolDependencies) {
  return [
    {
      tool: new DockerSandboxTool(dependencies),
      category: 'docker' as ToolCategory
    }
  ]
}

export { DockerSandboxTool, resolveSessionId } from './DockerSandboxTool'
