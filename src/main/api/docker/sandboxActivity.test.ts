import { mkdtempSync, readFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pubSubManager } from '../../lib/pubsub-manager'
import {
  ACTIVITY_FILENAME,
  activityChannel,
  clearActivity,
  flushActivityWrites,
  getActivity,
  recordExit,
  recordSettled,
  recordStart,
  recordStdin,
  recordUserEvent,
  resetActivityForTests,
  setSandboxDirectoryResolver,
  type SandboxActivityEntry
} from './sandboxActivity'

let root: string
let directory: string
let publish: jest.SpyInstance

const readLines = (dir = directory): SandboxActivityEntry[] => {
  const file = join(dir, ACTIVITY_FILENAME)
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as SandboxActivityEntry)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sandbox-activity-'))
  directory = join(root, 'my-chat-7f3a2c')
  mkdirSync(directory)
  resetActivityForTests()
  // Captured per test: a resolver closing over the mutable `directory` would send
  // writes still queued from an earlier test into this test's folder.
  const fixed = directory
  setSandboxDirectoryResolver(async () => fixed)
  publish = jest.spyOn(pubSubManager, 'publish').mockImplementation(() => undefined)
})

afterEach(async () => {
  await flushActivityWrites()
  publish.mockRestore()
  rmSync(root, { recursive: true, force: true })
})

describe('the three-event model', () => {
  it('records a start, then how it settled, then the real exit', async () => {
    const id = recordStart({
      sessionId: 'session_1',
      service: 'main',
      command: 'npm ci',
      cwd: '/workspace',
      pid: 8821
    })

    recordSettled({ sessionId: 'session_1', id, outcome: 'completed', exitCode: 0 })
    recordExit({ sessionId: 'session_1', id, exitCode: 0, stdoutBytes: 6144, stderrBytes: 0 })

    const entries = await getActivity('session_1')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      command: 'npm ci',
      source: 'agent',
      outcome: 'completed',
      exitCode: 0,
      pid: 8821,
      stdoutBytes: 6144
    })
    expect(entries[0].durationMs).toBeGreaterThanOrEqual(0)
  })

  it('keeps a detached process from reading as finished', async () => {
    // execInSandbox resolves early for a dev server and leaves it running; a naive
    // start/end pair would show this as "exit 0" forever.
    const id = recordStart({ sessionId: 'session_1', service: 'main', command: 'npm run dev' })
    recordSettled({ sessionId: 'session_1', id, outcome: 'detached' })

    const [entry] = await getActivity('session_1')
    expect(entry.outcome).toBe('detached')
    expect(entry.exitCode).toBeUndefined()
    expect(entry.endedAt).toBeUndefined()
  })

  it('marks a non-zero exit as failed', async () => {
    const id = recordStart({ sessionId: 'session_1', service: 'main', command: 'npx jest' })
    recordExit({ sessionId: 'session_1', id, exitCode: 1 })

    expect((await getActivity('session_1'))[0].outcome).toBe('failed')
  })

  it('does not overwrite a requires-input outcome when the process later exits', async () => {
    const id = recordStart({
      sessionId: 'session_1',
      service: 'main',
      command: 'apt-get install x'
    })
    recordSettled({ sessionId: 'session_1', id, outcome: 'requires-input' })
    recordExit({ sessionId: 'session_1', id, exitCode: 0 })

    const [entry] = await getActivity('session_1')
    expect(entry.outcome).toBe('requires-input')
    expect(entry.exitCode).toBe(0)
  })

  it('ignores updates for an unknown id rather than inventing a row', async () => {
    recordSettled({ sessionId: 'session_1', id: 'nope', outcome: 'completed' })
    expect(await getActivity('session_1')).toHaveLength(0)
  })
})

describe('publishing', () => {
  it('announces each transition on the session channel', () => {
    const id = recordStart({ sessionId: 'session_1', service: 'main', command: 'ls' })
    recordSettled({ sessionId: 'session_1', id, outcome: 'completed', exitCode: 0 })
    recordExit({ sessionId: 'session_1', id, exitCode: 0 })

    const types = publish.mock.calls
      .filter(([channel]) => channel === activityChannel('session_1'))
      .map(([, message]) => (message as { type: string }).type)
    expect(types).toEqual(['start', 'settled', 'exit'])
  })
})

describe('stdin', () => {
  it('records how many bytes were sent and never the text', async () => {
    const id = recordStart({ sessionId: 'session_1', service: 'main', command: 'psql' })
    recordStdin('session_1', id, 'hunter2\n'.length)

    const [entry] = await getActivity('session_1')
    expect(entry.stdinBytes).toBe(8)
    expect(JSON.stringify(entry)).not.toContain('hunter2')
  })

  it('accumulates across several follow-ups', async () => {
    const id = recordStart({ sessionId: 'session_1', service: 'main', command: 'psql' })
    recordStdin('session_1', id, 3)
    recordStdin('session_1', id, 4)

    expect((await getActivity('session_1'))[0].stdinBytes).toBe(7)
  })
})

describe('user events', () => {
  it('distinguishes what the user did from what the agent did', async () => {
    recordStart({ sessionId: 'session_1', service: 'main', command: 'npm ci' })
    recordUserEvent('session_1', 'main', 'Interactive terminal opened', 'running')

    const entries = await getActivity('session_1')
    expect(entries.map((entry) => entry.source)).toEqual(['agent', 'user'])
  })
})

describe('persistence', () => {
  it('writes entries to activity.jsonl in the sandbox folder', async () => {
    const id = recordStart({ sessionId: 'session_1', service: 'main', command: 'npm ci' })
    recordExit({ sessionId: 'session_1', id, exitCode: 0 })
    await flushActivityWrites()

    const lines = readLines()
    // Appended once per transition; the reader keeps the latest version of each id.
    expect(lines).toHaveLength(2)
    expect(lines[1]).toMatchObject({ id, exitCode: 0 })
  })

  it('survives a restart by reading the file back', async () => {
    const id = recordStart({ sessionId: 'session_1', service: 'main', command: 'npm run build' })
    recordSettled({ sessionId: 'session_1', id, outcome: 'completed', exitCode: 0 })
    await flushActivityWrites()

    // A fresh process: no memory, same folder.
    resetActivityForTests()
    setSandboxDirectoryResolver(async () => directory)

    const entries = await getActivity('session_1')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ id, command: 'npm run build', outcome: 'completed' })
  })

  it('skips a half-written final line left by a crash', async () => {
    const id = recordStart({ sessionId: 'session_1', service: 'main', command: 'ok' })
    await flushActivityWrites()
    require('fs').appendFileSync(join(directory, ACTIVITY_FILENAME), '{"id":"trunc"')

    resetActivityForTests()
    setSandboxDirectoryResolver(async () => directory)

    const entries = await getActivity('session_1')
    expect(entries.map((entry) => entry.id)).toEqual([id])
  })

  it('rewrites the file without its oldest half once it grows past the cap', async () => {
    for (let i = 0; i < 520; i++) {
      recordStart({ sessionId: 'session_1', service: 'main', command: `echo ${i}` })
    }
    await flushActivityWrites()

    const lines = readLines()
    expect(lines.length).toBeLessThanOrEqual(500)
    // The newest entries are the ones kept.
    expect(lines[lines.length - 1].command).toBe('echo 519')
  })

  it('re-resolves the folder on every append, because renaming a chat moves it', async () => {
    recordStart({ sessionId: 'session_1', service: 'main', command: 'before rename' })
    await flushActivityWrites()

    const renamed = join(root, 'renamed-chat-7f3a2c')
    mkdirSync(renamed)
    setSandboxDirectoryResolver(async () => renamed)

    recordStart({ sessionId: 'session_1', service: 'main', command: 'after rename' })
    await flushActivityWrites()

    expect(readLines(renamed).map((entry) => entry.command)).toEqual(['after rename'])
  })

  it('does not turn a failed write into an error for the caller', async () => {
    setSandboxDirectoryResolver(async () => join(root, 'does-not-exist'))

    expect(() =>
      recordStart({ sessionId: 'session_1', service: 'main', command: 'ls' })
    ).not.toThrow()
    await expect(flushActivityWrites()).resolves.toBeUndefined()
  })

  it('records nothing to disk when the sandbox folder cannot be resolved', async () => {
    setSandboxDirectoryResolver(async () => null)
    recordStart({ sessionId: 'session_1', service: 'main', command: 'ls' })
    await flushActivityWrites()

    expect(readLines()).toHaveLength(0)
    // Still in memory for the UI, though.
    expect(await getActivity('session_1')).toHaveLength(1)
  })
})

describe('caps', () => {
  it('keeps only the most recent entries per session in memory', async () => {
    for (let i = 0; i < 260; i++) {
      recordStart({ sessionId: 'session_1', service: 'main', command: `cmd ${i}` })
    }

    const entries = await getActivity('session_1')
    expect(entries).toHaveLength(200)
    expect(entries[0].command).toBe('cmd 60')
    expect(entries[199].command).toBe('cmd 259')
  })

  it('forgets the least recently touched session past the session cap', async () => {
    setSandboxDirectoryResolver(async () => null)
    for (let i = 0; i < 21; i++) {
      recordStart({ sessionId: `session_${i}`, service: 'main', command: 'ls' })
    }

    expect(await getActivity('session_0')).toHaveLength(0)
    expect(await getActivity('session_20')).toHaveLength(1)
  })

  it('truncates an enormous generated command', async () => {
    recordStart({ sessionId: 'session_1', service: 'main', command: 'x'.repeat(5000) })
    const [entry] = await getActivity('session_1')
    expect(entry.command.length).toBeLessThan(5000)
    expect(entry.command.endsWith('…')).toBe(true)
  })
})

describe('clearActivity', () => {
  it('removes the log from memory and from disk', async () => {
    recordStart({ sessionId: 'session_1', service: 'main', command: 'ls' })
    await flushActivityWrites()
    expect(readLines()).toHaveLength(1)

    await clearActivity('session_1')

    expect(existsSync(join(directory, ACTIVITY_FILENAME))).toBe(false)
    expect(await getActivity('session_1')).toHaveLength(0)
  })
})
