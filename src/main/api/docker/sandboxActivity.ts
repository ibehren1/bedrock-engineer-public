import { randomUUID } from 'crypto'
import { appendFile, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { createCategoryLogger } from '../../../common/logger'
import { pubSubManager } from '../../lib/pubsub-manager'

/**
 * Record of what has happened inside a chat's sandbox: every command the agent ran,
 * and every time the user opened an interactive terminal.
 *
 * The agent's commands are already in the chat transcript, but not in a form that
 * answers "what is this container actually doing" — a detached dev server looks
 * identical to a finished command there. This keeps a per-sandbox log instead.
 */

const logger = createCategoryLogger('docker:sandbox-activity')

/** Filename inside the sandbox folder, alongside sandbox.json. */
export const ACTIVITY_FILENAME = 'activity.jsonl'

/** Entries held per session for the UI. */
const MEMORY_LIMIT = 200
/** Sessions tracked before the least recently touched is dropped. */
const SESSION_LIMIT = 20
/** Lines kept on disk before the file is rewritten without its oldest half. */
const FILE_LINE_LIMIT = 500
/** Commands longer than this are stored truncated — some are generated and enormous. */
const COMMAND_LIMIT = 2048

export type ActivityOutcome =
  | 'running'
  | 'completed'
  | 'requires-input'
  | 'detached'
  | 'timeout'
  | 'failed'

export interface SandboxActivityEntry {
  id: string
  sessionId: string
  service: string
  /** The command, or a description for user events like opening a terminal. */
  command: string
  /** 'agent' for model-issued commands, 'user' for things done in the terminal. */
  source: 'agent' | 'user'
  outcome: ActivityOutcome
  startedAt: string
  endedAt?: string
  durationMs?: number
  exitCode?: number
  cwd?: string
  pid?: number
  stdoutBytes?: number
  stderrBytes?: number
  /**
   * Bytes of stdin sent in a follow-up. The content is deliberately not recorded: a
   * model answering a prompt may be typing a credential.
   */
  stdinBytes?: number
}

type ActivityEvent =
  | { type: 'start'; entry: SandboxActivityEntry }
  | { type: 'settled'; entry: SandboxActivityEntry }
  | { type: 'exit'; entry: SandboxActivityEntry }

export const activityChannel = (sessionId: string): string => `docker-sandbox:activity:${sessionId}`

/** Insertion-ordered, so the first key is the least recently touched session. */
const sessions = new Map<string, SandboxActivityEntry[]>()

/**
 * Resolves a session's sandbox folder. Injected rather than imported so this module
 * does not depend on sandboxManager, which depends (transitively) on it.
 */
type DirectoryResolver = (sessionId: string) => Promise<string | null>
let resolveDirectory: DirectoryResolver = async () => null

export const setSandboxDirectoryResolver = (resolver: DirectoryResolver): void => {
  resolveDirectory = resolver
}

/** Serializes writes per session so two appends cannot interleave a rotation. */
const writeQueues = new Map<string, Promise<void>>()

const enqueueWrite = (sessionId: string, task: () => Promise<void>): void => {
  const previous = writeQueues.get(sessionId) ?? Promise.resolve()
  const next = previous.then(task).catch((error) => {
    // Best-effort: a sandbox whose folder was just deleted must not turn a command
    // into a tool error.
    logger.debug('Could not persist sandbox activity', {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    })
  })
  writeQueues.set(sessionId, next)
}

const touch = (sessionId: string): SandboxActivityEntry[] => {
  const existing = sessions.get(sessionId)
  if (existing) {
    // Re-insert so this session moves to the back of the eviction order.
    sessions.delete(sessionId)
    sessions.set(sessionId, existing)
    return existing
  }

  const fresh: SandboxActivityEntry[] = []
  sessions.set(sessionId, fresh)
  while (sessions.size > SESSION_LIMIT) {
    const oldest = sessions.keys().next().value
    if (oldest === undefined) break
    sessions.delete(oldest)
  }
  return fresh
}

const persist = (entry: SandboxActivityEntry): void => {
  enqueueWrite(entry.sessionId, async () => {
    // Resolved on every append: renameSandbox moves the folder while containers keep
    // running, so a cached path goes stale.
    const directory = await resolveDirectory(entry.sessionId)
    if (!directory) return

    const file = join(directory, ACTIVITY_FILENAME)
    await appendFile(file, `${JSON.stringify(entry)}\n`, 'utf-8')

    const contents = await readFile(file, 'utf-8')
    const lines = contents.split('\n').filter(Boolean)
    if (lines.length > FILE_LINE_LIMIT) {
      const kept = lines.slice(Math.floor(lines.length / 2))
      await writeFile(file, `${kept.join('\n')}\n`, 'utf-8')
    }
  })
}

const publish = (event: ActivityEvent): void => {
  pubSubManager.publish(activityChannel(event.entry.sessionId), event)
}

const truncateCommand = (command: string): string =>
  command.length > COMMAND_LIMIT ? `${command.slice(0, COMMAND_LIMIT)}…` : command

export interface RecordStartInput {
  sessionId: string
  service: string
  command: string
  source?: 'agent' | 'user'
  cwd?: string
  pid?: number
}

/**
 * Record a command as started. Returns the entry id, which the caller passes back to
 * `recordSettled`/`recordExit`.
 */
export const recordStart = (input: RecordStartInput): string => {
  const entry: SandboxActivityEntry = {
    id: randomUUID(),
    sessionId: input.sessionId,
    service: input.service,
    command: truncateCommand(input.command),
    source: input.source ?? 'agent',
    outcome: 'running',
    startedAt: new Date().toISOString(),
    cwd: input.cwd,
    pid: input.pid
  }

  const entries = touch(input.sessionId)
  entries.push(entry)
  if (entries.length > MEMORY_LIMIT) entries.splice(0, entries.length - MEMORY_LIMIT)

  publish({ type: 'start', entry })
  persist(entry)
  return entry.id
}

const findEntry = (sessionId: string, id: string): SandboxActivityEntry | undefined =>
  sessions.get(sessionId)?.find((entry) => entry.id === id)

export interface RecordSettledInput {
  sessionId: string
  id: string
  outcome: ActivityOutcome
  exitCode?: number
  durationMs?: number
}

/**
 * Record how a command resolved for the caller.
 *
 * This is distinct from exiting: execInSandbox resolves early — and deliberately leaves
 * the process running — when output looks like an interactive prompt, when a dev server
 * has come up, or when the timeout elapses. Without this step a `npm run dev` row would
 * read "exit 0" forever.
 */
export const recordSettled = (input: RecordSettledInput): void => {
  const entry = findEntry(input.sessionId, input.id)
  if (!entry) return

  entry.outcome = input.outcome
  if (input.exitCode !== undefined) entry.exitCode = input.exitCode
  if (input.durationMs !== undefined) entry.durationMs = input.durationMs

  publish({ type: 'settled', entry })
  persist(entry)
}

export interface RecordExitInput {
  sessionId: string
  id: string
  exitCode: number
  stdoutBytes?: number
  stderrBytes?: number
}

/** Record the process actually ending. Upgrades the row in place. */
export const recordExit = (input: RecordExitInput): void => {
  const entry = findEntry(input.sessionId, input.id)
  if (!entry) return

  entry.exitCode = input.exitCode
  entry.endedAt = new Date().toISOString()
  entry.durationMs = Date.parse(entry.endedAt) - Date.parse(entry.startedAt)
  entry.stdoutBytes = input.stdoutBytes
  entry.stderrBytes = input.stderrBytes
  // A process that had resolved as detached or requires-input has now really finished.
  if (entry.outcome === 'running' || entry.outcome === 'completed') {
    entry.outcome = input.exitCode === 0 ? 'completed' : 'failed'
  }

  publish({ type: 'exit', entry })
  persist(entry)
}

/** Record stdin sent to a waiting command. Length only, never the text. */
export const recordStdin = (sessionId: string, id: string, bytes: number): void => {
  const entry = findEntry(sessionId, id)
  if (!entry) return

  entry.stdinBytes = (entry.stdinBytes ?? 0) + bytes
  publish({ type: 'settled', entry })
  persist(entry)
}

/**
 * Record something the user did rather than the agent.
 *
 * Terminal sessions are logged as single open/close events on purpose. Recovering
 * individual commands from a PTY byte stream is not reliable — line editing, heredocs
 * and full-screen programs all defeat it — and a list that is quietly wrong is worse
 * than one that is honest about its granularity.
 */
export const recordUserEvent = (
  sessionId: string,
  service: string,
  description: string,
  outcome: ActivityOutcome = 'completed',
  exitCode?: number
): string => {
  const id = recordStart({ sessionId, service, command: description, source: 'user' })
  if (outcome !== 'running') recordSettled({ sessionId, id, outcome, exitCode })
  return id
}

/**
 * Entries for a session, newest last. Reads the persisted file when nothing is in
 * memory yet, which is what makes the list survive an app restart.
 */
export const getActivity = async (sessionId: string): Promise<SandboxActivityEntry[]> => {
  const inMemory = sessions.get(sessionId)
  if (inMemory && inMemory.length > 0) return [...inMemory]

  const directory = await resolveDirectory(sessionId)
  if (!directory) return []

  try {
    const contents = await readFile(join(directory, ACTIVITY_FILENAME), 'utf-8')
    const parsed: SandboxActivityEntry[] = []
    const seen = new Map<string, number>()

    for (const line of contents.split('\n')) {
      if (!line.trim()) continue
      try {
        const entry = JSON.parse(line) as SandboxActivityEntry
        // Each entry is appended again as it progresses; keep the latest version.
        const at = seen.get(entry.id)
        if (at === undefined) {
          seen.set(entry.id, parsed.length)
          parsed.push(entry)
        } else {
          parsed[at] = entry
        }
      } catch {
        // A half-written final line is expected after a crash. Skip it.
      }
    }

    const recent = parsed.slice(-MEMORY_LIMIT)
    sessions.set(sessionId, recent)
    return [...recent]
  } catch {
    return []
  }
}

/** Forget a session's activity, in memory and on disk. Used when a sandbox is removed. */
export const clearActivity = async (sessionId: string): Promise<void> => {
  sessions.delete(sessionId)

  const directory = await resolveDirectory(sessionId)
  if (!directory) return
  try {
    await unlink(join(directory, ACTIVITY_FILENAME))
  } catch {
    // Already gone, which is the usual case when the whole folder was deleted.
  }
}

/** Test seam: drop all in-memory state. */
export const resetActivityForTests = (): void => {
  sessions.clear()
  writeQueues.clear()
  resolveDirectory = async () => null
}

/** Test seam: wait for queued writes to settle. */
export const flushActivityWrites = async (): Promise<void> => {
  await Promise.all([...writeQueues.values()])
}
