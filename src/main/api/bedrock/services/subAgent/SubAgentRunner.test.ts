import { MAX_DELEGATION_DEPTH } from '../../../../../common/agents/delegation'
import {
  SubAgentRunner,
  SUB_AGENT_MAX_CONCURRENT,
  type SubAgentInvokeParams
} from './SubAgentRunner'

jest.mock('../../../../../preload/store', () => ({
  store: { get: jest.fn(() => ({ modelId: 'test-model' })) }
}))

jest.mock('../../../../../common/logger', () => ({
  createCategoryLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn()
  })
}))

type MockService = {
  getAllAgents: jest.Mock
  createSession: jest.Mock
  deleteSession: jest.Mock
  chat: jest.Mock
}

const chatResult = (text = 'done', toolCount = 0) => ({
  response: { id: 'm1', role: 'assistant', content: [{ text }], timestamp: 0 },
  toolExecutions: Array.from({ length: toolCount }, (_v, i) => ({
    toolName: i % 2 === 0 ? 'readFiles' : 'listFiles',
    input: {},
    output: {},
    success: true
  }))
})

const makeService = (overrides: Partial<MockService> = {}): MockService => ({
  getAllAgents: jest.fn().mockResolvedValue([
    { id: 'reviewerAgent', name: 'Reviewer', icon: 'robot' },
    { id: 'writerAgent', name: 'Writer' }
  ]),
  createSession: jest.fn().mockResolvedValue(undefined),
  deleteSession: jest.fn().mockReturnValue(true),
  chat: jest.fn().mockResolvedValue(chatResult()),
  ...overrides
})

const params = (overrides: Partial<SubAgentInvokeParams> = {}): SubAgentInvokeParams => ({
  agentId: 'reviewerAgent',
  task: 'Review src/main',
  callerAgentId: 'callerAgent',
  depth: 0,
  lineage: ['callerAgent'],
  allowedAgentIds: ['reviewerAgent'],
  modelId: 'test-model',
  ...overrides
})

const makeRunner = (service: MockService) => new SubAgentRunner(() => service as any)

describe('SubAgentRunner policy checks', () => {
  it('rejects an agent that was not mentioned, without starting a run', async () => {
    const service = makeService()

    await expect(makeRunner(service).invoke(params({ agentId: 'writerAgent' }))).rejects.toThrow(
      /not permitted/
    )

    expect(service.chat).not.toHaveBeenCalled()
    expect(service.createSession).not.toHaveBeenCalled()
  })

  it('rejects a caller already at the depth limit', async () => {
    const service = makeService()

    await expect(
      makeRunner(service).invoke(params({ depth: MAX_DELEGATION_DEPTH }))
    ).rejects.toThrow(/depth limit/)

    expect(service.chat).not.toHaveBeenCalled()
  })

  it('rejects a target already in the caller chain', async () => {
    const service = makeService()

    await expect(
      makeRunner(service).invoke(
        params({
          agentId: 'reviewerAgent',
          lineage: ['callerAgent', 'reviewerAgent'],
          allowedAgentIds: ['reviewerAgent', 'writerAgent']
        })
      )
    ).rejects.toThrow(/loop blocked/)

    expect(service.chat).not.toHaveBeenCalled()
  })

  it('rejects an allowlisted agent that no longer exists', async () => {
    const service = makeService({ getAllAgents: jest.fn().mockResolvedValue([]) })

    await expect(makeRunner(service).invoke(params())).rejects.toThrow(/Agent not found/)
    expect(service.chat).not.toHaveBeenCalled()
  })
})

describe('SubAgentRunner happy path', () => {
  it('creates the session before chatting and deletes it afterwards', async () => {
    const order: string[] = []
    const service = makeService({
      createSession: jest.fn().mockImplementation(async () => {
        order.push('createSession')
      }),
      chat: jest.fn().mockImplementation(async () => {
        order.push('chat')
        return chatResult('reviewed', 3)
      }),
      deleteSession: jest.fn().mockImplementation(() => {
        order.push('deleteSession')
        return true
      })
    })

    const result = await makeRunner(service).invoke(params())

    expect(order).toEqual(['createSession', 'chat', 'deleteSession'])
    expect(result.success).toBe(true)
    expect(result.agentName).toBe('Reviewer')
    expect(result.finalText).toBe('reviewed')
    expect(result.toolCallCount).toBe(3)
    expect(result.toolNames).toEqual(['readFiles', 'listFiles'])
    expect(result.depth).toBe(1)
    expect(result.stoppedReason).toBe('completed')
  })

  it('passes depth, lineage, and the allowlist down to the sub-agent', async () => {
    const service = makeService()

    await makeRunner(service).invoke(params({ allowedAgentIds: ['reviewerAgent', 'writerAgent'] }))

    const config = service.chat.mock.calls[0][1]
    expect(config.delegationDepth).toBe(1)
    expect(config.delegationLineage).toEqual(['callerAgent', 'reviewerAgent'])
    expect(config.allowedDelegationAgentIds).toEqual(['reviewerAgent', 'writerAgent'])
  })

  it('caps the sub-agent tool budget rather than inheriting the engine default', async () => {
    const service = makeService()

    await makeRunner(service).invoke(params())

    const options = service.chat.mock.calls[0][3]
    expect(options.maxToolExecutions).toBe(30)
    expect(options.timeoutMs).toBe(10 * 60 * 1000)
  })

  it('reports a partial answer when the tool budget was exhausted', async () => {
    const service = makeService({ chat: jest.fn().mockResolvedValue(chatResult('partial', 2)) })

    const result = await makeRunner(service).invoke(params({ options: { maxToolExecutions: 2 } }))

    expect(result.success).toBe(true)
    expect(result.stoppedReason).toBe('maxToolExecutions')
  })

  it('substitutes a placeholder when the sub-agent produced no text', async () => {
    const service = makeService({
      chat: jest.fn().mockResolvedValue({
        response: { id: 'm1', role: 'assistant', content: [], timestamp: 0 },
        toolExecutions: []
      })
    })

    const result = await makeRunner(service).invoke(params())
    expect(result.finalText).toMatch(/no text output/)
  })

  it('deletes the session even when the run fails', async () => {
    const service = makeService({ chat: jest.fn().mockRejectedValue(new Error('bedrock down')) })

    await expect(makeRunner(service).invoke(params())).rejects.toThrow('bedrock down')
    expect(service.deleteSession).toHaveBeenCalledTimes(1)
  })
})

describe('SubAgentRunner concurrency', () => {
  it('rejects once the concurrency cap is reached', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const service = makeService({
      chat: jest.fn().mockImplementation(async () => {
        await gate
        return chatResult()
      })
    })
    const runner = makeRunner(service)

    const inFlight = Array.from({ length: SUB_AGENT_MAX_CONCURRENT }, () => runner.invoke(params()))
    // Let each in-flight call get past its own concurrency check
    await new Promise((resolve) => setImmediate(resolve))

    await expect(runner.invoke(params())).rejects.toThrow(/Too many concurrent delegations/)

    release?.()
    await Promise.all(inFlight)
  })
})

describe('SubAgentRunner timeout', () => {
  it('fails with a timeout error and cleans up when the orphaned run settles', async () => {
    let finishChat: (() => void) | undefined
    const chatPromise = new Promise((resolve) => {
      finishChat = () => resolve(chatResult())
    })

    const service = makeService({ chat: jest.fn().mockReturnValue(chatPromise) })
    const runner = makeRunner(service)

    await expect(runner.invoke(params({ options: { timeoutMs: 20 } }))).rejects.toThrow(/timed out/)

    // The abandoned run is skipped in `finally`, then cleaned up once it settles
    expect(service.deleteSession).not.toHaveBeenCalled()

    finishChat?.()
    await new Promise((resolve) => setImmediate(resolve))

    expect(service.deleteSession).toHaveBeenCalledWith(expect.stringContaining('subagent-'))
  })
})
