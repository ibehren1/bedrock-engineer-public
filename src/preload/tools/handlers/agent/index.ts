/**
 * Agent delegation tools exports
 */

import { ToolDependencies, ITool, ToolCategory } from '../../base/types'
import { InvokeAgentTool } from './InvokeAgentTool'

export { InvokeAgentTool } from './InvokeAgentTool'

/**
 * Create agent delegation tools
 */
export function createAgentTools(dependencies: ToolDependencies): Array<{
  tool: ITool
  category: ToolCategory
}> {
  return [
    {
      tool: new InvokeAgentTool(dependencies),
      category: 'agent' as ToolCategory
    }
  ]
}
