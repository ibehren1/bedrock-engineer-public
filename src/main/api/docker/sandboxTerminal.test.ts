import { PassThrough } from 'stream'
import type { Socket } from 'net'
import { pubSubManager } from '../../lib/pubsub-manager'
import {
  attachTerminal,
  closeAllTerminals,
  closeSessionTerminals,
  closeTerminal,
  countTerminals,
  findSessionTerminal,
  getTerminalBacklog,
  openTerminal,
  resizeTerminal,
  setTerminalTransport,
  terminalChannel,
  writeToTerminal,
  type TerminalTransport
} from './sandboxTerminal'

jest.mock('./sandboxActivity', () => ({
  recordUserEvent: jest.fn(() => 'activity-id'),
  recordSettled: jest.fn()
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { recordUserEvent, recordSettled } = require('./sandboxActivity') as {
  recordUserEvent: jest.Mock
  recordSettled: jest.Mock
}

/**
 * A stand-in for the hijacked Docker socket: output is pushed in by the test, input
 * written by the code under test is captured instead of being echoed back.
 */
const makeFakeSocket = () => {
  const stream = new PassThrough()
  const writes: string[] = []
  const socket = stream as unknown as Socket
  ;(socket as unknown as { write: (data: string) => boolean }).write = (data: string) => {
    writes.push(data)
    return true
  }
  return { socket, writes, push: (data: string | Buffer) => stream.push(data), stream }
}

interface Harness {
  transport: TerminalTransport
  fake: ReturnType<typeof makeFakeSocket>
  resizes: { cols: number; rows: number }[]
  exitCode: number | null
}

const makeHarness = (initial = ''): Harness => {
  const fake = makeFakeSocket()
  const resizes: { cols: number; rows: number }[] = []
  const harness: Harness = {
    fake,
    resizes,
    exitCode: 0,
    transport: {
      createExec: async () => 'exec-1',
      startExec: async () => ({ socket: fake.socket, initial: Buffer.from(initial) }),
      resizeExec: async (_execId, cols, rows) => {
        resizes.push({ cols, rows })
      },
      execExitCode: async () => harness.exitCode
    }
  }
  return harness
}

const target = { sessionId: 'session_1', service: 'main', containerName: 'sandbox-main-1' }

/** Long enough for stream delivery plus at least one 16ms flush tick. */
const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms))

const dataFrames = (publish: jest.SpyInstance, channel: string): Buffer[] =>
  publish.mock.calls
    .filter(([ch, message]) => ch === channel && (message as { type: string }).type === 'data')
    .map(([, message]) => Buffer.from((message as { bytes: Uint8Array }).bytes))

let publish: jest.SpyInstance

beforeEach(() => {
  publish = jest.spyOn(pubSubManager, 'publish').mockImplementation(() => undefined)
  recordUserEvent.mockClear()
  recordSettled.mockClear()
})

afterEach(() => {
  closeAllTerminals()
  publish.mockRestore()
})

describe('openTerminal', () => {
  it('creates the exec with the requested size and returns a channel', async () => {
    const harness = makeHarness()
    const createExec = jest.spyOn(harness.transport, 'createExec')
    setTerminalTransport(harness.transport)

    const result = await openTerminal(target, 120, 40)

    expect(createExec).toHaveBeenCalledWith('sandbox-main-1', 120, 40)
    expect(result.channel).toBe(terminalChannel(result.terminalId))
    expect(result.cols).toBe(120)
  })

  it('reuses the existing terminal for a chat rather than opening a second shell', async () => {
    setTerminalTransport(makeHarness().transport)

    const first = await openTerminal(target)
    const second = await openTerminal(target)

    expect(second.terminalId).toBe(first.terminalId)
    expect(countTerminals()).toBe(1)
    expect(findSessionTerminal('session_1')?.terminalId).toBe(first.terminalId)
  })

  it('gives each compose service its own shell', async () => {
    // The panel shows a tab per container, so reuse has to be keyed on the service and not
    // just the chat — otherwise the db tab would attach to the main container's shell.
    setTerminalTransport(makeHarness().transport)
    const main = await openTerminal({ ...target, service: 'main' })
    setTerminalTransport(makeHarness().transport)
    const db = await openTerminal({ ...target, service: 'db', containerName: 'sandbox-db-1' })

    expect(db.terminalId).not.toBe(main.terminalId)
    expect(countTerminals()).toBe(2)
    expect(findSessionTerminal('session_1', 'main')?.terminalId).toBe(main.terminalId)
    expect(findSessionTerminal('session_1', 'db')?.terminalId).toBe(db.terminalId)
    expect(db.service).toBe('db')
  })

  it('reuses the shell for the same service, and closes both with the chat', async () => {
    setTerminalTransport(makeHarness().transport)
    const first = await openTerminal({ ...target, service: 'main' })
    const again = await openTerminal({ ...target, service: 'main' })
    expect(again.terminalId).toBe(first.terminalId)

    setTerminalTransport(makeHarness().transport)
    await openTerminal({ ...target, service: 'db', containerName: 'sandbox-db-1' })
    expect(countTerminals()).toBe(2)

    closeSessionTerminals('session_1')
    expect(countTerminals()).toBe(0)
  })

  it('records the session in the activity log', async () => {
    setTerminalTransport(makeHarness().transport)
    await openTerminal(target)

    expect(recordUserEvent).toHaveBeenCalledWith(
      'session_1',
      'main',
      'Interactive terminal opened',
      'running'
    )
  })

  it('records no activity row when the shell could not be started', async () => {
    // What happens when the container has stopped: Docker accepts the exec, then the
    // stream carries "OCI runtime exec failed: container not running" and exits 128. An
    // "opened" row for a shell that never opened is what filled the log, one entry per
    // retry, because the renderer immediately tried again.
    const harness = makeHarness()
    harness.transport.createExec = async () => {
      throw new Error(
        'The sandbox container is exited. Start the sandbox before opening a terminal.'
      )
    }
    setTerminalTransport(harness.transport)

    await expect(openTerminal(target)).rejects.toThrow(/Start the sandbox/)
    expect(recordUserEvent).not.toHaveBeenCalled()
    expect(countTerminals()).toBe(0)
  })

  it('buffers output and publishes nothing until the renderer attaches', async () => {
    const harness = makeHarness('root@abc:/# ')
    setTerminalTransport(harness.transport)

    const { terminalId, channel } = await openTerminal(target)
    harness.fake.push('ls\r\n')
    await settle()

    // pubsub has no replay, so publishing before the subscription exists would lose it.
    expect(dataFrames(publish, channel)).toHaveLength(0)
    expect(Buffer.from(getTerminalBacklog(terminalId)).toString()).toBe('root@abc:/# ls\r\n')
  })
})

describe('attachTerminal', () => {
  it('hands back the scrollback so far, then streams live output', async () => {
    const harness = makeHarness('prompt> ')
    setTerminalTransport(harness.transport)
    const { terminalId, channel } = await openTerminal(target)
    await settle()

    const { backlog } = attachTerminal(terminalId)
    expect(Buffer.from(backlog).toString()).toBe('prompt> ')

    harness.fake.push('live output')
    await settle()

    expect(Buffer.concat(dataFrames(publish, channel)).toString()).toBe('live output')
  })

  it('coalesces several chunks into one frame per flush', async () => {
    const harness = makeHarness()
    setTerminalTransport(harness.transport)
    const { terminalId, channel } = await openTerminal(target)
    attachTerminal(terminalId)

    for (let i = 0; i < 20; i++) harness.fake.push(`chunk-${i} `)
    await settle()

    const frames = dataFrames(publish, channel)
    expect(frames.length).toBeLessThan(20)
    expect(Buffer.concat(frames).toString()).toContain('chunk-19')
  })

  it('throws for an unknown terminal rather than silently doing nothing', () => {
    expect(() => attachTerminal('nope')).toThrow(/No terminal/)
  })
})

describe('backpressure', () => {
  it('pauses the container stream past the high-water mark and resumes after a flush', async () => {
    const harness = makeHarness()
    setTerminalTransport(harness.transport)
    const { terminalId } = await openTerminal(target)

    // 300 KB with no subscriber: more than the 256 KB high-water mark.
    harness.fake.push('x'.repeat(300 * 1024))
    await settle()

    expect(harness.fake.stream.isPaused()).toBe(true)

    attachTerminal(terminalId)
    await settle()

    expect(harness.fake.stream.isPaused()).toBe(false)
  })

  it('drops the oldest output and flags truncation when a single chunk is enormous', async () => {
    const harness = makeHarness()
    setTerminalTransport(harness.transport)
    const { terminalId, channel } = await openTerminal(target)

    // Chunked output can never reach the 1 MB pending cap — the 256 KB pause stops
    // delivery first. The cap is a backstop for one oversized chunk, so that is what
    // this exercises.
    harness.fake.push('y'.repeat(2 * 1024 * 1024))
    await settle(80)

    attachTerminal(terminalId)
    harness.fake.push('tail')
    await settle()

    const truncatedFrames = publish.mock.calls.filter(
      ([ch, message]) => ch === channel && (message as { truncated?: boolean }).truncated
    )
    expect(truncatedFrames).toHaveLength(1)
  })
})

describe('scrollback ring', () => {
  it('stays within its cap and resumes at a line boundary', async () => {
    const harness = makeHarness()
    setTerminalTransport(harness.transport)
    const { terminalId } = await openTerminal(target)
    attachTerminal(terminalId)

    // 400 KB of numbered lines, past the 256 KB ring.
    for (let i = 0; i < 4000; i++) harness.fake.push(`line ${i} ${'.'.repeat(90)}\n`)
    await settle(150)

    const backlog = Buffer.from(getTerminalBacklog(terminalId))
    expect(backlog.length).toBeLessThanOrEqual(256 * 1024)
    // Trimming cuts forward to a newline, so a replay never starts mid-sequence.
    expect(backlog.toString().startsWith('line ')).toBe(true)
    expect(backlog.toString()).toContain('line 3999')
  })
})

describe('input and resize', () => {
  it('forwards keystrokes to the container', async () => {
    const harness = makeHarness()
    setTerminalTransport(harness.transport)
    const { terminalId } = await openTerminal(target)

    writeToTerminal(terminalId, 'ls -la\r')
    writeToTerminal(terminalId, '\x03')

    expect(harness.fake.writes).toEqual(['ls -la\r', '\x03'])
  })

  it('ignores writes to a closed terminal instead of throwing', async () => {
    const harness = makeHarness()
    setTerminalTransport(harness.transport)
    const { terminalId } = await openTerminal(target)
    closeTerminal(terminalId)

    expect(() => writeToTerminal(terminalId, 'ls')).not.toThrow()
  })

  it('only calls Docker when the size actually changed', async () => {
    const harness = makeHarness()
    setTerminalTransport(harness.transport)
    const { terminalId } = await openTerminal(target, 80, 24)

    await resizeTerminal(terminalId, 80, 24)
    expect(harness.resizes).toHaveLength(0)

    await resizeTerminal(terminalId, 100, 30)
    await resizeTerminal(terminalId, 100, 30)
    expect(harness.resizes).toEqual([{ cols: 100, rows: 30 }])
  })
})

describe('lifecycle', () => {
  it('publishes an exit with the code Docker reports when the shell ends', async () => {
    const harness = makeHarness()
    harness.exitCode = 3
    setTerminalTransport(harness.transport)
    const { terminalId, channel } = await openTerminal(target)
    attachTerminal(terminalId)

    harness.fake.stream.destroy()
    await settle()

    expect(publish).toHaveBeenCalledWith(channel, { type: 'exit', exitCode: 3 })
    expect(countTerminals()).toBe(0)
    // The row this session opened is closed out, rather than a second row being added.
    expect(recordUserEvent).toHaveBeenCalledTimes(1)
    expect(recordSettled).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'activity-id', outcome: 'failed', exitCode: 3 })
    )
  })

  it('closes every terminal belonging to one chat, leaving others alone', async () => {
    setTerminalTransport(makeHarness().transport)
    await openTerminal(target)
    setTerminalTransport(makeHarness().transport)
    await openTerminal({ ...target, sessionId: 'session_2' })
    expect(countTerminals()).toBe(2)

    closeSessionTerminals('session_1')

    expect(findSessionTerminal('session_1')).toBeUndefined()
    expect(findSessionTerminal('session_2')).toBeDefined()
    expect(countTerminals()).toBe(1)
  })

  it('evicts the least recently used terminal past the cap of 8', async () => {
    for (let i = 0; i < 9; i++) {
      setTerminalTransport(makeHarness().transport)
      await openTerminal({ ...target, sessionId: `session_${i}` })
      // Space the timestamps so "least recently used" is well defined.
      await settle(2)
    }

    expect(countTerminals()).toBe(8)
    expect(findSessionTerminal('session_0')).toBeUndefined()
    expect(findSessionTerminal('session_8')).toBeDefined()
  })

  it('closeAllTerminals leaves nothing behind', async () => {
    for (let i = 0; i < 3; i++) {
      setTerminalTransport(makeHarness().transport)
      await openTerminal({ ...target, sessionId: `chat_${i}` })
    }

    closeAllTerminals()

    expect(countTerminals()).toBe(0)
  })
})
