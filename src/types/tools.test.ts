import { BUILT_IN_TOOLS, isBuiltInTool, isMcpTool, type BuiltInToolName } from './tools'
import { TOOL_MAPPING } from '../main/services/strandsAgentsConverter/toolMapper'

/**
 * `BuiltInToolName` and `BUILT_IN_TOOLS` are maintained by hand. A name that is
 * in the union but missing from the array silently routes the tool to the MCP
 * adapter, which is hard to spot at runtime, so guard the pairing here.
 */
describe('built-in tool registration', () => {
  it('has no duplicate entries', () => {
    expect(new Set(BUILT_IN_TOOLS).size).toBe(BUILT_IN_TOOLS.length)
  })

  it('covers every tool in TOOL_MAPPING, which is keyed by the union type', () => {
    // TOOL_MAPPING is a total Record<BuiltInToolName, StrandsTool>, so its keys
    // are exactly the union. Comparing against BUILT_IN_TOOLS catches a name
    // added to the union but forgotten in the array.
    const mappedNames = Object.keys(TOOL_MAPPING).sort()
    const registeredNames = [...BUILT_IN_TOOLS].sort()

    expect(registeredNames).toEqual(mappedNames)
  })

  it('classifies registered names as built-in, not MCP', () => {
    for (const name of BUILT_IN_TOOLS) {
      expect(isBuiltInTool(name)).toBe(true)
      expect(isMcpTool(name)).toBe(false)
    }
  })

  it('treats an unknown name as an MCP tool', () => {
    expect(isBuiltInTool('someMcpServerTool')).toBe(false)
    expect(isMcpTool('someMcpServerTool')).toBe(true)
  })

  it('includes invokeAgent', () => {
    const name: BuiltInToolName = 'invokeAgent'
    expect(BUILT_IN_TOOLS).toContain(name)
  })
})
