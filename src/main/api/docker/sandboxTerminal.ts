import { randomUUID } from 'crypto'
import type { Socket } from 'net'
import { createCategoryLogger } from '../../../common/logger'
import { pubSubManager } from '../../lib/pubsub-manager'
import {
  DockerEngineUnavailable,
  engineHijack,
  engineRequest,
  resolveDockerEndpoint
} from './dockerEngine'
import { recordSettled, recordUserEvent } from './sandboxActivity'
import { WORKSPACE_MOUNT } from './types'

/**
 * Interactive shells inside sandbox containers.
 *
 * This is deliberately a second, TTY-having exec path that does not go through
 * `execInSandbox`. The two must not be merged: `sandboxExec.ts` omits `-t` so that the
 * prompt and server-ready matchers in `outputPatterns.ts` see clean output, and feeding
 * this module's byte stream through those matchers would make them fire on ANSI escape
 * sequences. Nothing here enters `runningExecs`, so the model cannot send stdin to a
 * shell the user is typing into.
 *
 * There is also no tool, no toolSpec and no preload tool handler for any of this. The
 * only caller is the chat page. Adding a `terminal` operation to `DockerSandboxTool`
 * would hand the model an unfiltered root shell and must not happen.
 */

const logger = createCategoryLogger('docker:sandbox-terminal')

/** Output is batched on this cadence — roughly one frame — instead of per chunk. */
const FLUSH_INTERVAL_MS = 16
/** Pending bytes at which the container's stdout is paused. */
const HIGH_WATER_BYTES = 256 * 1024
/** Pending bytes we refuse to exceed even so; the oldest are dropped. */
const PENDING_CAP_BYTES = 1024 * 1024
/** Replayable scrollback held per terminal. */
const RING_BYTES = 256 * 1024
/** Live terminals before the least recently used is closed. */
const TERMINAL_LIMIT = 8

export interface TerminalTarget {
  sessionId: string
  service: string
  containerName: string
}

export interface OpenTerminalResult {
  terminalId: string
  channel: string
  /** Which compose service this shell is inside. */
  service: string
  cols: number
  rows: number
}

type TerminalMessage =
  | { type: 'data'; bytes: Uint8Array; truncated?: boolean }
  | { type: 'exit'; exitCode: number | null }
  | { type: 'error'; message: string }

export const terminalChannel = (terminalId: string): string =>
  `docker-sandbox:terminal:${terminalId}`

/**
 * The pieces of the transport this module needs, behind an interface so tests can
 * drive a plain duplex stream instead of Docker.
 */
export interface TerminalTransport {
  createExec(containerName: string, cols: number, rows: number): Promise<string>
  /** Returns a paused socket plus any bytes that arrived with the HTTP header. */
  startExec(execId: string): Promise<{ socket: Socket; initial: Buffer }>
  resizeExec(execId: string, cols: number, rows: number): Promise<void>
  execExitCode(execId: string): Promise<number | null>
}

const shellCommand = [
  '/bin/sh',
  '-c',
  // Prefer bash for line editing and history; fall back to sh on minimal images.
  'if command -v bash >/dev/null 2>&1; then exec bash -il; else exec sh -i; fi'
]

const engineTransport: TerminalTransport = {
  async createExec(containerName, cols, rows) {
    // Docker will happily create and start an exec against a stopped container: the
    // stream then carries "OCI runtime exec failed: container not running" and exits
    // 128. Checking first turns that into a message the panel can show, instead of a
    // shell that dies the instant it opens.
    const inspected = await engineRequest<{ State?: { Running?: boolean; Status?: string } }>(
      'GET',
      `/containers/${containerName}/json`
    )
    if (inspected.status !== 200) {
      throw new DockerEngineUnavailable(
        `The sandbox container ${containerName} could not be found (HTTP ${inspected.status}).`
      )
    }
    if (!inspected.body?.State?.Running) {
      throw new DockerEngineUnavailable(
        `The sandbox container is ${inspected.body?.State?.Status ?? 'not running'}. Start the sandbox before opening a terminal.`
      )
    }

    const response = await engineRequest<{ Id?: string; message?: string }>(
      'POST',
      `/containers/${containerName}/exec`,
      {
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        ConsoleSize: [rows, cols],
        WorkingDir: WORKSPACE_MOUNT,
        Env: ['TERM=xterm-256color'],
        Cmd: shellCommand
      }
    )

    if (response.status !== 201 || !response.body?.Id) {
      throw new DockerEngineUnavailable(
        response.body?.message ?? `Docker refused to create a shell (HTTP ${response.status})`
      )
    }
    return response.body.Id
  },

  async startExec(execId) {
    // Tty: true means output is a single raw stream with no 8-byte frame header, so
    // bytes go straight to the terminal emulator.
    const { socket, initial } = await engineHijack(`/exec/${execId}/start`, {
      Detach: false,
      Tty: true
    })
    return { socket, initial }
  },

  async resizeExec(execId, cols, rows) {
    // Only valid once the exec is running, and only for Tty execs.
    await engineRequest('POST', `/exec/${execId}/resize?h=${rows}&w=${cols}`)
  },

  async execExitCode(execId) {
    const response = await engineRequest<{ ExitCode?: number | null }>(
      'GET',
      `/exec/${execId}/json`
    )
    return response.status === 200 ? response.body?.ExitCode ?? null : null
  }
}

let transport: TerminalTransport = engineTransport

/** Test seam: swap the Docker transport for a fake. */
export const setTerminalTransport = (next: TerminalTransport): void => {
  transport = next
}

interface TerminalSession {
  terminalId: string
  sessionId: string
  service: string
  containerName: string
  execId: string
  socket: Socket
  cols: number
  rows: number
  activityId: string
  createdAt: number
  lastUsedAt: number
  /** True once the renderer has subscribed and asked for output. */
  attached: boolean
  closed: boolean
  paused: boolean
  pending: Buffer[]
  pendingBytes: number
  /** Set when output had to be dropped, so the UI can say so once. */
  truncated: boolean
  ring: Buffer[]
  ringBytes: number
  timer?: NodeJS.Timeout
}

const terminals = new Map<string, TerminalSession>()

const trimRing = (session: TerminalSession): void => {
  while (session.ringBytes > RING_BYTES && session.ring.length > 0) {
    const first = session.ring[0]
    if (session.ringBytes - first.length >= RING_BYTES) {
      session.ring.shift()
      session.ringBytes -= first.length
      continue
    }

    // Cut forward to the next newline so a replay never starts mid-escape-sequence.
    const excess = session.ringBytes - RING_BYTES
    const newline = first.indexOf(0x0a, excess)
    const cut = newline === -1 ? first.length : newline + 1
    const remainder = first.subarray(cut)
    session.ringBytes -= first.length - remainder.length
    if (remainder.length === 0) session.ring.shift()
    else session.ring[0] = remainder
  }
}

const flush = (session: TerminalSession): void => {
  if (session.pending.length === 0) return
  if (!session.attached) return

  const payload = Buffer.concat(session.pending)
  session.pending = []
  session.pendingBytes = 0

  const message: TerminalMessage = session.truncated
    ? { type: 'data', bytes: new Uint8Array(payload), truncated: true }
    : { type: 'data', bytes: new Uint8Array(payload) }
  session.truncated = false

  pubSubManager.publish(terminalChannel(session.terminalId), message)

  if (session.paused) {
    session.paused = false
    session.socket.resume()
  }
}

const startFlushTimer = (session: TerminalSession): void => {
  if (session.timer) return
  session.timer = setInterval(() => flush(session), FLUSH_INTERVAL_MS)
  // Never hold the event loop open on account of a terminal.
  session.timer.unref?.()
}

const ingest = (session: TerminalSession, chunk: Buffer): void => {
  session.ring.push(chunk)
  session.ringBytes += chunk.length
  trimRing(session)

  session.pending.push(chunk)
  session.pendingBytes += chunk.length

  // Real backpressure: pausing the socket fills the pty's write buffer, which blocks
  // the program inside the container. PubSubManager.publish is a synchronous
  // webContents.send with no backpressure of its own, so this is the only defence
  // against a command like `yes` saturating the main process.
  if (!session.paused && session.pendingBytes >= HIGH_WATER_BYTES) {
    session.paused = true
    session.socket.pause()
  }

  if (session.pendingBytes > PENDING_CAP_BYTES) {
    const keep = Buffer.concat(session.pending).subarray(-PENDING_CAP_BYTES / 2)
    session.pending = [keep]
    session.pendingBytes = keep.length
    session.truncated = true
  }
}

const finish = (session: TerminalSession, exitCode: number | null): void => {
  if (session.closed) return
  session.closed = true

  if (session.timer) clearInterval(session.timer)
  session.timer = undefined
  flush(session)
  terminals.delete(session.terminalId)

  pubSubManager.publish(terminalChannel(session.terminalId), {
    type: 'exit',
    exitCode
  } satisfies TerminalMessage)

  // Update the row this session opened rather than adding a second one, so a terminal is
  // one entry in the log that ends, not an "opened" row stuck on running plus a "closed"
  // row next to it.
  recordSettled({
    sessionId: session.sessionId,
    id: session.activityId,
    outcome: exitCode === null || exitCode === 0 ? 'completed' : 'failed',
    exitCode: exitCode ?? undefined,
    durationMs: Date.now() - session.createdAt
  })

  logger.debug('Terminal closed', { terminalId: session.terminalId, exitCode })
}

const evictIfNeeded = (): void => {
  while (terminals.size >= TERMINAL_LIMIT) {
    let oldest: TerminalSession | undefined
    for (const session of terminals.values()) {
      if (!oldest || session.lastUsedAt < oldest.lastUsedAt) oldest = session
    }
    if (!oldest) return

    logger.info('Closing least recently used terminal to stay under the limit', {
      terminalId: oldest.terminalId
    })
    if (oldest.attached) {
      pubSubManager.publish(terminalChannel(oldest.terminalId), {
        type: 'data',
        bytes: new Uint8Array(Buffer.from('\r\n[terminal closed: too many open sessions]\r\n'))
      } satisfies TerminalMessage)
    }
    oldest.socket.destroy()
    finish(oldest, null)
  }
}

/**
 * The live terminal for a chat's service, if there is one.
 *
 * One shell per service, not per chat: a compose stack has a container per service, and
 * the panel gives each one its own tab. Called without a service this answers whether the
 * chat has any shell at all, which is what the lifecycle hooks care about.
 */
export const findSessionTerminal = (
  sessionId: string,
  service?: string
): OpenTerminalResult | undefined => {
  for (const session of terminals.values()) {
    if (session.sessionId !== sessionId || session.closed) continue
    if (service !== undefined && session.service !== service) continue
    return {
      terminalId: session.terminalId,
      channel: terminalChannel(session.terminalId),
      service: session.service,
      cols: session.cols,
      rows: session.rows
    }
  }
  return undefined
}

/**
 * Whether an interactive terminal can be opened at all. A remote Docker context has no
 * local socket to attach to; the reason is shown in the panel rather than failing on
 * the first keystroke.
 */
export const getTerminalCapability = async (): Promise<{
  supported: boolean
  reason?: string
  endpoint?: string
}> => {
  try {
    const endpoint = await resolveDockerEndpoint()
    if (!endpoint.socketPath) {
      return {
        supported: false,
        endpoint: endpoint.host,
        reason: `Your Docker context points at a remote daemon (${endpoint.host}), so the app cannot attach a shell to the container. A remote daemon also cannot mount your project folder at ${WORKSPACE_MOUNT}.`
      }
    }
    const ping = await engineRequest('GET', '/_ping')
    if (ping.status !== 200) {
      return {
        supported: false,
        endpoint: endpoint.host,
        reason: `The Docker socket at ${endpoint.socketPath} did not answer (HTTP ${ping.status}).`
      }
    }
    return { supported: true, endpoint: endpoint.host }
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Open a shell in a sandbox container. Buffers output into the scrollback ring without
 * publishing until `attachTerminal` is called, because pubsub has no replay and drops
 * anything published before the renderer subscribes.
 */
export const openTerminal = async (
  target: TerminalTarget,
  cols = 80,
  rows = 24
): Promise<OpenTerminalResult> => {
  // Keyed on the service as well: a compose stack gets one shell per container.
  const existing = findSessionTerminal(target.sessionId, target.service)
  if (existing) return existing

  evictIfNeeded()

  const execId = await transport.createExec(target.containerName, cols, rows)
  const { socket, initial } = await transport.startExec(execId)

  const terminalId = randomUUID()
  const session: TerminalSession = {
    terminalId,
    sessionId: target.sessionId,
    service: target.service,
    containerName: target.containerName,
    execId,
    socket,
    cols,
    rows,
    activityId: recordUserEvent(
      target.sessionId,
      target.service,
      'Interactive terminal opened',
      'running'
    ),
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    attached: false,
    closed: false,
    paused: false,
    pending: [],
    pendingBytes: 0,
    truncated: false,
    ring: [],
    ringBytes: 0
  }

  terminals.set(terminalId, session)

  socket.on('data', (chunk: Buffer) => ingest(session, chunk))
  socket.on('error', (error: Error) => {
    if (session.attached) {
      pubSubManager.publish(terminalChannel(terminalId), {
        type: 'error',
        message: error.message
      } satisfies TerminalMessage)
    }
  })
  socket.on('close', () => {
    void transport
      .execExitCode(execId)
      .then((exitCode) => finish(session, exitCode))
      .catch(() => finish(session, null))
  })

  // The transport hands back a paused socket so nothing is lost before the handlers
  // above exist. Feed in what came with the header, then let it flow.
  if (initial.length > 0) ingest(session, initial)
  socket.resume()

  startFlushTimer(session)

  logger.info('Terminal opened', {
    terminalId,
    sessionId: target.sessionId,
    container: target.containerName,
    cols,
    rows
  })

  return { terminalId, channel: terminalChannel(terminalId), service: target.service, cols, rows }
}

/** Begin publishing. Call only after the renderer has subscribed to the channel. */
export const attachTerminal = (terminalId: string): { backlog: Uint8Array } => {
  const session = terminals.get(terminalId)
  if (!session) throw new Error(`No terminal ${terminalId}`)

  session.attached = true
  session.lastUsedAt = Date.now()

  // Hand the scrollback back directly rather than publishing it, so the renderer can
  // write it before any live frame arrives.
  const backlog = new Uint8Array(Buffer.concat(session.ring))
  session.pending = []
  session.pendingBytes = 0
  if (session.paused) {
    session.paused = false
    session.socket.resume()
  }
  return { backlog }
}

/** Scrollback for a terminal, used when the panel is reopened. */
export const getTerminalBacklog = (terminalId: string): Uint8Array => {
  const session = terminals.get(terminalId)
  if (!session) return new Uint8Array()
  return new Uint8Array(Buffer.concat(session.ring))
}

export const writeToTerminal = (terminalId: string, data: string): void => {
  const session = terminals.get(terminalId)
  if (!session || session.closed) return
  session.lastUsedAt = Date.now()
  session.socket.write(data)
}

export const resizeTerminal = async (
  terminalId: string,
  cols: number,
  rows: number
): Promise<void> => {
  const session = terminals.get(terminalId)
  if (!session || session.closed) return
  if (session.cols === cols && session.rows === rows) return

  session.cols = cols
  session.rows = rows
  session.lastUsedAt = Date.now()
  await transport.resizeExec(session.execId, cols, rows)
}

export const closeTerminal = (terminalId: string): void => {
  const session = terminals.get(terminalId)
  if (!session) return
  session.socket.destroy()
  finish(session, null)
}

/**
 * Close every terminal for a chat. Called beside `invalidateSessionExecs` when a
 * sandbox is stopped or removed, and when a chat is deleted.
 */
export const closeSessionTerminals = (sessionId: string): void => {
  for (const session of [...terminals.values()]) {
    if (session.sessionId === sessionId) closeTerminal(session.terminalId)
  }
}

/** Close everything. Called on app quit, before the containers are stopped. */
export const closeAllTerminals = (): void => {
  for (const terminalId of [...terminals.keys()]) closeTerminal(terminalId)
}

/** Test seam: number of live terminals. */
export const countTerminals = (): number => terminals.size
