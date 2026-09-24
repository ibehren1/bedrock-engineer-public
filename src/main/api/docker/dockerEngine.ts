import http from 'http'
import net from 'net'
import { createCategoryLogger } from '../../../common/logger'
import { run } from './composeRunner'

/**
 * Minimal Docker Engine API client over the local socket.
 *
 * The sandbox does everything else through the `docker` CLI, which is the right tool
 * for one-shot commands. The interactive terminal cannot use it: `docker exec -t`
 * refuses to allocate a TTY when its own stdio is a pipe, which it always is under
 * `spawn`. The Engine API has no such restriction, and it is the only way to resize a
 * running exec (`POST /exec/{id}/resize` applies only to execs created with
 * `Tty: true`).
 *
 * Deliberately hand-rolled on `node:http`/`node:net` rather than pulling in dockerode:
 * this uses five endpoints, and dockerode brings an SSH client and a tar implementation
 * with it. Node's `socketPath` option covers both Unix sockets and Windows named pipes,
 * so there is no platform branch beyond parsing the endpoint string.
 */

const logger = createCategoryLogger('docker:engine')

const REQUEST_TIMEOUT_MS = 10_000
const ENDPOINT_TTL_MS = 15_000

/** Raised when the Engine API cannot be reached. `reason` is shown to the user verbatim. */
export class DockerEngineUnavailable extends Error {
  constructor(public readonly reason: string) {
    super(reason)
    this.name = 'DockerEngineUnavailable'
  }
}

export type DockerEndpointScheme = 'unix' | 'npipe' | 'remote'

export interface DockerEndpoint {
  /** The raw endpoint string, e.g. `unix:///var/run/docker.sock`. */
  host: string
  scheme: DockerEndpointScheme
  /** Path to connect to, or null for a remote daemon we cannot attach a terminal to. */
  socketPath: string | null
  /** Where the endpoint came from, for diagnostics. */
  source: 'DOCKER_HOST' | 'docker context' | 'platform default'
}

/**
 * Parse a Docker endpoint string into something `socketPath` accepts.
 *
 * `tcp://` and `ssh://` resolve to `remote` with no socket path. That is not a gap to
 * fill later: a remote daemon cannot bind-mount the user's project directory at
 * /workspace either, so the whole sandbox feature already assumes a local daemon.
 */
export const parseDockerHost = (host: string): Omit<DockerEndpoint, 'source'> => {
  const trimmed = host.trim()

  if (trimmed.startsWith('unix://')) {
    return { host: trimmed, scheme: 'unix', socketPath: trimmed.slice('unix://'.length) }
  }

  if (trimmed.startsWith('npipe://')) {
    // `npipe:////./pipe/docker_engine` -> `\\.\pipe\docker_engine`
    return {
      host: trimmed,
      scheme: 'npipe',
      socketPath: trimmed.slice('npipe://'.length).replace(/\//g, '\\')
    }
  }

  // A bare path is what some setups put in DOCKER_HOST.
  if (trimmed.startsWith('/') || /^\\\\/.test(trimmed)) {
    return {
      host: trimmed,
      scheme: process.platform === 'win32' ? 'npipe' : 'unix',
      socketPath: trimmed
    }
  }

  return { host: trimmed, scheme: 'remote', socketPath: null }
}

const platformDefaultHost = (): string =>
  process.platform === 'win32' ? 'npipe:////./pipe/docker_engine' : 'unix:///var/run/docker.sock'

let cached: { endpoint: DockerEndpoint; at: number } | undefined

/**
 * Locate the Docker socket.
 *
 * Asking the CLI is what makes this work on more than Docker Desktop: OrbStack, Colima,
 * Rancher Desktop and rootless installs all put the socket somewhere else, and the
 * context is the one place that knows where. Hardcoding /var/run/docker.sock would be
 * wrong on a plain OrbStack install.
 */
export const resolveDockerEndpoint = async (force = false): Promise<DockerEndpoint> => {
  if (!force && cached && Date.now() - cached.at < ENDPOINT_TTL_MS) {
    return cached.endpoint
  }

  let endpoint: DockerEndpoint

  if (process.env.DOCKER_HOST) {
    endpoint = { ...parseDockerHost(process.env.DOCKER_HOST), source: 'DOCKER_HOST' }
  } else {
    const result = await run(
      'docker',
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      { timeoutMs: 8000 }
    )
    const host = result.exitCode === 0 ? result.stdout.trim() : ''
    endpoint = host
      ? { ...parseDockerHost(host), source: 'docker context' }
      : { ...parseDockerHost(platformDefaultHost()), source: 'platform default' }
  }

  cached = { endpoint, at: Date.now() }
  logger.debug('Resolved Docker endpoint', {
    host: endpoint.host,
    scheme: endpoint.scheme,
    source: endpoint.source
  })
  return endpoint
}

/** Drop the cached endpoint. Used by tests and after an availability re-check. */
export const resetDockerEndpointCache = (): void => {
  cached = undefined
}

const requireLocalSocket = async (): Promise<string> => {
  const endpoint = await resolveDockerEndpoint()
  if (!endpoint.socketPath) {
    throw new DockerEngineUnavailable(
      `This Docker context points at a remote daemon (${endpoint.host}). The in-app terminal needs a local Docker socket.`
    )
  }
  return endpoint.socketPath
}

const describeConnectError = (error: NodeJS.ErrnoException, socketPath: string): string => {
  if (error.code === 'ENOENT') {
    return `No Docker socket at ${socketPath}. Is Docker running?`
  }
  if (error.code === 'EACCES') {
    return `Permission denied opening the Docker socket at ${socketPath}.`
  }
  return `Could not reach the Docker socket at ${socketPath}: ${error.message}`
}

export interface EngineResponse<T> {
  status: number
  body: T
}

/** One JSON request against the Engine API. Resolves for any status code. */
export const engineRequest = async <T = unknown>(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown
): Promise<EngineResponse<T>> => {
  const socketPath = await requireLocalSocket()
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body))

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        socketPath,
        method,
        path,
        timeout: REQUEST_TIMEOUT_MS,
        headers: payload
          ? { 'content-type': 'application/json', 'content-length': payload.length }
          : {}
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8')
          let parsed: unknown = null
          if (raw) {
            try {
              parsed = JSON.parse(raw)
            } catch {
              parsed = raw
            }
          }
          resolve({ status: response.statusCode ?? 0, body: parsed as T })
        })
      }
    )

    request.on('timeout', () => {
      request.destroy(new Error(`Docker API request timed out after ${REQUEST_TIMEOUT_MS}ms`))
    })
    request.on('error', (error: NodeJS.ErrnoException) => {
      reject(new DockerEngineUnavailable(describeConnectError(error, socketPath)))
    })

    if (payload) request.write(payload)
    request.end()
  })
}

export interface HijackedStream {
  /**
   * The upgraded connection, returned **paused**. Attach handlers, consume `initial`,
   * then call `resume()`. Handing back a flowing socket would drop whatever arrives
   * between this promise resolving and the caller attaching its listener.
   */
  socket: net.Socket
  status: number
  /** Stream bytes that shared the HTTP header's chunk — usually the first prompt. */
  initial: Buffer
}

/**
 * Split a buffer at the end of the HTTP response header.
 *
 * Exported because this is the one piece of the transport with an off-by-one worth
 * testing: the bytes after `\r\n\r\n` in the *same* chunk are already stream payload
 * and must not be dropped.
 */
export const splitHttpHeader = (
  buffer: Buffer
): { status: number; headers: string; rest: Buffer } | null => {
  const index = buffer.indexOf('\r\n\r\n')
  if (index === -1) return null

  const headers = buffer.subarray(0, index).toString('latin1')
  const statusLine = headers.split('\r\n')[0] ?? ''
  const status = Number(statusLine.split(' ')[1] ?? 0)

  return { status, headers, rest: buffer.subarray(index + 4) }
}

/**
 * Upgrade a connection to a raw bidirectional stream.
 *
 * Done by hand rather than through `http.request` + the `upgrade` event: after the
 * upgrade this is not HTTP any more, and driving the socket directly avoids having to
 * reason about Node's `head` remainder handling on a connection we are about to take
 * over completely.
 */
export const engineHijack = async (path: string, body: unknown): Promise<HijackedStream> => {
  const socketPath = await requireLocalSocket()
  const payload = Buffer.from(JSON.stringify(body))

  return new Promise((resolve, reject) => {
    const socket = net.connect({ path: socketPath })
    let header = Buffer.alloc(0)
    let upgraded = false

    const onData = (chunk: Buffer) => {
      if (upgraded) return
      header = Buffer.concat([header, chunk])
      const split = splitHttpHeader(header)
      if (!split) return

      upgraded = true
      socket.off('data', onData)
      socket.off('error', onError)
      // Removing the last 'data' listener does not stop the flow, so pause explicitly
      // and let the caller resume once it is listening.
      socket.pause()

      if (split.status !== 101 && split.status !== 200) {
        socket.destroy()
        reject(new DockerEngineUnavailable(`Docker refused the exec stream (HTTP ${split.status})`))
        return
      }

      resolve({ socket, status: split.status, initial: split.rest })
    }

    const onError = (error: NodeJS.ErrnoException) => {
      reject(new DockerEngineUnavailable(describeConnectError(error, socketPath)))
    }

    socket.on('data', onData)
    socket.on('error', onError)
    socket.on('connect', () => {
      socket.write(
        `POST ${path} HTTP/1.1\r\n` +
          'Host: docker\r\n' +
          'Content-Type: application/json\r\n' +
          'Connection: Upgrade\r\n' +
          'Upgrade: tcp\r\n' +
          `Content-Length: ${payload.length}\r\n\r\n`
      )
      socket.write(payload)
    })
  })
}

export interface ContainerInspect {
  Id: string
  Name: string
  Config: { Image: string }
  Image: string
  State: { Status: string; Running: boolean; StartedAt: string }
}

export const inspectContainer = async (name: string): Promise<ContainerInspect> => {
  const response = await engineRequest<ContainerInspect>('GET', `/containers/${name}/json`)
  if (response.status !== 200) {
    throw new DockerEngineUnavailable(
      `Could not inspect container ${name} (HTTP ${response.status})`
    )
  }
  return response.body
}

interface RawStats {
  cpu_stats?: {
    cpu_usage?: { total_usage?: number }
    system_cpu_usage?: number
    online_cpus?: number
  }
  memory_stats?: {
    usage?: number
    limit?: number
    stats?: { inactive_file?: number }
  }
  /** One entry per interface, keyed by name (`eth0`, …). Absent for `network_mode: none`. */
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>
  /**
   * Block IO, as a list of `{ major, minor, op, value }`. Empty on hosts whose storage
   * driver does not report it — notably Docker Desktop and OrbStack on macOS, where the
   * containers run in a VM.
   */
  blkio_stats?: {
    io_service_bytes_recursive?: { op?: string; value?: number }[] | null
  }
}

export interface ContainerSample {
  /** When this sample was taken, for turning cumulative counters into rates. */
  at: number
  /** Nanoseconds of CPU time used by the container, cumulative. */
  cpuTotal: number
  /** Nanoseconds of CPU time across the host, cumulative. */
  systemTotal: number
  onlineCpus: number
  memoryUsed: number
  memoryLimit: number
  /** Cumulative bytes received / sent across every interface. */
  netRx: number
  netTx: number
  /** Cumulative bytes read / written to block devices, or undefined when not reported. */
  blockRead?: number
  blockWrite?: number
}

/**
 * One-shot resource sample.
 *
 * `one-shot=true` makes the daemon answer immediately, but it zeroes `precpu_stats`, so
 * a single response cannot yield a CPU percentage — the caller has to keep the previous
 * sample and diff. The alternative (`one-shot=false`) makes the daemon hold the request
 * open for roughly a second to collect two cycles itself, which is too slow to poll.
 *
 * Memory subtracts `inactive_file` from `usage`, which is what `docker stats` reports;
 * the raw `usage` figure includes page cache and reads alarmingly high.
 */
export const containerStats = async (name: string): Promise<ContainerSample> => {
  const response = await engineRequest<RawStats>(
    'GET',
    `/containers/${name}/stats?stream=false&one-shot=true`
  )
  if (response.status !== 200) {
    throw new DockerEngineUnavailable(`Could not read stats for ${name} (HTTP ${response.status})`)
  }

  const raw = response.body
  const usage = raw.memory_stats?.usage ?? 0
  const inactiveFile = raw.memory_stats?.stats?.inactive_file ?? 0

  // Summed across interfaces: a sandbox has one, but a compose service can have more.
  const interfaces = Object.values(raw.networks ?? {})
  const netRx = interfaces.reduce((total, entry) => total + (entry.rx_bytes ?? 0), 0)
  const netTx = interfaces.reduce((total, entry) => total + (entry.tx_bytes ?? 0), 0)

  const blkio = raw.blkio_stats?.io_service_bytes_recursive
  const sumOps = (ops: string[]): number | undefined => {
    if (!blkio || blkio.length === 0) return undefined
    return blkio
      .filter((entry) => ops.includes((entry.op ?? '').toLowerCase()))
      .reduce((total, entry) => total + (entry.value ?? 0), 0)
  }

  return {
    at: Date.now(),
    cpuTotal: raw.cpu_stats?.cpu_usage?.total_usage ?? 0,
    systemTotal: raw.cpu_stats?.system_cpu_usage ?? 0,
    onlineCpus: raw.cpu_stats?.online_cpus ?? 0,
    memoryUsed: Math.max(0, usage - inactiveFile),
    memoryLimit: raw.memory_stats?.limit ?? 0,
    netRx,
    netTx,
    blockRead: sumOps(['read']),
    blockWrite: sumOps(['write'])
  }
}

/**
 * CPU percentage between two samples, in the same units `docker stats` prints: 100%
 * means one full core, so a container using two cores reads 200%.
 */
export const cpuPercentBetween = (
  previous: ContainerSample,
  current: ContainerSample
): number | undefined => {
  const cpuDelta = current.cpuTotal - previous.cpuTotal
  const systemDelta = current.systemTotal - previous.systemTotal
  if (systemDelta <= 0 || cpuDelta < 0) return undefined
  const cpus = current.onlineCpus || previous.onlineCpus || 1
  return (cpuDelta / systemDelta) * cpus * 100
}

export interface ContainerRates {
  /** Bytes per second since the previous sample. */
  netRxPerSecond?: number
  netTxPerSecond?: number
  blockReadPerSecond?: number
  blockWritePerSecond?: number
}

/**
 * Turn two cumulative samples into per-second rates.
 *
 * Counters reset when a container is recreated, so a negative delta is reported as
 * undefined rather than as a nonsensical rate.
 */
export const ratesBetween = (
  previous: ContainerSample,
  current: ContainerSample
): ContainerRates => {
  const seconds = (current.at - previous.at) / 1000
  if (seconds <= 0) return {}

  const rate = (before?: number, after?: number): number | undefined => {
    if (before === undefined || after === undefined) return undefined
    const delta = after - before
    return delta < 0 ? undefined : delta / seconds
  }

  return {
    netRxPerSecond: rate(previous.netRx, current.netRx),
    netTxPerSecond: rate(previous.netTx, current.netTx),
    blockReadPerSecond: rate(previous.blockRead, current.blockRead),
    blockWritePerSecond: rate(previous.blockWrite, current.blockWrite)
  }
}

export interface EngineContainerRow {
  service: string
  name: string
  state: string
  ports: string
}

interface RawContainer {
  Names?: string[]
  State?: string
  Labels?: Record<string, string>
  Ports?: { PrivatePort?: number; PublicPort?: number; Type?: string }[]
}

/**
 * Containers belonging to a compose project, in the same shape `listProjectContainers`
 * returns from `docker ps`. Used while the panel is open so a 3-second refresh does not
 * mean a process spawn every three seconds.
 */
export const listProjectContainersViaEngine = async (
  projectName: string
): Promise<EngineContainerRow[]> => {
  const filters = encodeURIComponent(
    JSON.stringify({ label: [`com.docker.compose.project=${projectName}`] })
  )
  const response = await engineRequest<RawContainer[]>(
    'GET',
    `/containers/json?all=1&filters=${filters}`
  )
  if (response.status !== 200 || !Array.isArray(response.body)) {
    throw new DockerEngineUnavailable(
      `Could not list containers for ${projectName} (HTTP ${response.status})`
    )
  }

  return response.body.map((container) => ({
    service: container.Labels?.['com.docker.compose.service'] ?? '',
    name: (container.Names?.[0] ?? '').replace(/^\//, ''),
    state: container.State ?? '',
    ports: (container.Ports ?? [])
      .filter((port) => port.PublicPort)
      .map((port) => `0.0.0.0:${port.PublicPort}->${port.PrivatePort}/${port.Type ?? 'tcp'}`)
      .join(', ')
  }))
}
