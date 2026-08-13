/**
 * CodeInterpreter tools exports
 */

import { ToolDependencies, ToolCategory } from '../../base/types'
import { CodeInterpreterTool } from './CodeInterpreterTool'

/**
 * Create CodeInterpreter tools
 */
export function createCodeInterpreterTools(dependencies: ToolDependencies) {
  return [
    {
      tool: new CodeInterpreterTool(dependencies),
      category: 'interpreter' as ToolCategory
    }
  ]
}

// Re-export main components for external use
export { CodeInterpreterTool } from './CodeInterpreterTool'
export { DockerExecutor } from './DockerExecutor'
export { FileManager } from './FileManager'
export { SecurityManager } from './SecurityManager'

// Re-export simplified types
export type {
  CodeInterpreterInput,
  CodeInterpreterResult,
  CodeExecutionResult,
  ExecutionConfig,
  WorkspaceConfig,
  SupportedLanguage
} from './types'
