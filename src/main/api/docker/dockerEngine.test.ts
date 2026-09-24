import net from 'net'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  containerStats,
  cpuPercentBetween,
  ratesBetween,
  DockerEngineUnavailable,
  engineHijack,
  engineRequest,
  parseDockerHost,
  resetDockerEndpointCache,
  resolveDockerEndpoint,
  splitHttpHeader
} from './dockerEngine'

jest.mock('./composeRunner', () => ({
  run: jest.fn()
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { run } = require('./composeRunner') as { run: jest.Mock }

const originalDockerHost = process.env.DOCKER_HOST

beforeEach(() => {
  resetDockerEndpointCache()
  run.mockReset()
  delete process.env.DOCKER_HOST
})

afterAll(() => {
  if (originalDockerHost === undefined) delete process.env.DOCKER_HOST
  else process.env.DOCKER_HOST = originalDockerHost
})

describe('parseDockerHost', () => {
  it('reads a unix socket path', () => {
    expect(parseDockerHost('unix:///var/run/docker.sock')).toEqual({
      host: 'unix:///var/run/docker.sock',
      scheme: 'unix',
      socketPath: '/var/run/docker.sock'
    })
  })

  it('handles a non-default socket location, as OrbStack and Colima use', () => {
    expect(parseDockerHost('unix:///Users/me/.orbstack/run/docker.sock').socketPath).toBe(
      '/Users/me/.orbstack/run/docker.sock'
    )
  })

  it('converts a Windows named pipe to backslash form', () => {
    expect(parseDockerHost('npipe:////./pipe/docker_engine')).toEqual({
      host: 'npipe:////./pipe/docker_engine',
      scheme: 'npipe',
      socketPath: '\\\\.\\pipe\\docker_engine'
    })
  })

  it('accepts a bare path, which some setups put in DOCKER_HOST', () => {
    expect(parseDockerHost('/run/user/1000/docker.sock').socketPath).toBe(
      '/run/user/1000/docker.sock'
    )
  })

  it('reports tcp and ssh endpoints as remote with no socket path', () => {
    expect(parseDockerHost('tcp://10.0.4.19:2376')).toMatchObject({
      scheme: 'remote',
      socketPath: null
    })
    expect(parseDockerHost('ssh://user@build-host')).toMatchObject({
      scheme: 'remote',
      socketPath: null
    })
  })

  it('trims surrounding whitespace from CLI output', () => {
    expect(parseDockerHost('  unix:///var/run/docker.sock\n').socketPath).toBe(
      '/var/run/docker.sock'
    )
  })
})

describe('resolveDockerEndpoint', () => {
  it('prefers DOCKER_HOST over the docker context', async () => {
    process.env.DOCKER_HOST = 'unix:///tmp/from-env.sock'
    const endpoint = await resolveDockerEndpoint(true)
    expect(endpoint).toMatchObject({ socketPath: '/tmp/from-env.sock', source: 'DOCKER_HOST' })
    expect(run).not.toHaveBeenCalled()
  })

  it('asks the docker context when DOCKER_HOST is unset', async () => {
    run.mockResolvedValue({
      stdout: 'unix:///Users/me/.orbstack/run/docker.sock\n',
      stderr: '',
      exitCode: 0,
      timedOut: false
    })
    const endpoint = await resolveDockerEndpoint(true)
    expect(run).toHaveBeenCalledWith(
      'docker',
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      expect.anything()
    )
    expect(endpoint).toMatchObject({
      socketPath: '/Users/me/.orbstack/run/docker.sock',
      source: 'docker context'
    })
  })

  it('falls back to the platform default when the context lookup fails', async () => {
    run.mockResolvedValue({ stdout: '', stderr: 'boom', exitCode: 1, timedOut: false })
    const endpoint = await resolveDockerEndpoint(true)
    expect(endpoint.source).toBe('platform default')
    expect(endpoint.socketPath).toBe(
      process.platform === 'win32' ? '\\\\.\\pipe\\docker_engine' : '/var/run/docker.sock'
    )
  })

  it('caches the endpoint so every request does not spawn the CLI', async () => {
    run.mockResolvedValue({
      stdout: 'unix:///tmp/cached.sock',
      stderr: '',
      exitCode: 0,
      timedOut: false
    })
    await resolveDockerEndpoint(true)
    await resolveDockerEndpoint()
    await resolveDockerEndpoint()
    expect(run).toHaveBeenCalledTimes(1)
  })
})

describe('splitHttpHeader', () => {
  it('returns null until the whole header has arrived', () => {
    expect(splitHttpHeader(Buffer.from('HTTP/1.1 101 UPGRADED\r\nUpgrade: tcp'))).toBeNull()
  })

  it('keeps payload that arrived in the same chunk as the header', () => {
    const buffer = Buffer.from('HTTP/1.1 101 UPGRADED\r\nUpgrade: tcp\r\n\r\nroot@abc:/# ')
    const split = splitHttpHeader(buffer)
    expect(split?.status).toBe(101)
    expect(split?.rest.toString()).toBe('root@abc:/# ')
  })

  it('parses a plain 200 response', () => {
    expect(splitHttpHeader(Buffer.from('HTTP/1.1 200 OK\r\n\r\n'))?.status).toBe(200)
  })

  it('works when fed one byte at a time', () => {
    const full = Buffer.from('HTTP/1.1 101 UPGRADED\r\n\r\nX')
    let acc = Buffer.alloc(0)
    let split: ReturnType<typeof splitHttpHeader> = null
    for (const byte of full) {
      acc = Buffer.concat([acc, Buffer.from([byte])])
      split = splitHttpHeader(acc)
      if (split) break
    }
    expect(split?.status).toBe(101)
    // The trailing X arrives after the split, so it is not in `rest` yet.
    expect(split?.rest.length).toBe(0)
  })

  it('does not mistake a body-only CRLF pair for the header terminator', () => {
    const split = splitHttpHeader(
      Buffer.from('HTTP/1.1 101 UPGRADED\r\nA: b\r\n\r\nline1\r\nline2')
    )
    expect(split?.rest.toString()).toBe('line1\r\nline2')
  })
})

describe('cpuPercentBetween', () => {
  const sample = (cpuTotal: number, systemTotal: number, onlineCpus = 4) => ({
    at: 0,
    cpuTotal,
    systemTotal,
    onlineCpus,
    memoryUsed: 0,
    memoryLimit: 0,
    netRx: 0,
    netTx: 0
  })

  it('reports 100% for one fully used core', () => {
    // 1/4 of total host CPU time across 4 cores = one core = 100%.
    expect(cpuPercentBetween(sample(0, 0), sample(25, 100))).toBeCloseTo(100, 5)
  })

  it('goes above 100% for more than one core, as docker stats does', () => {
    expect(cpuPercentBetween(sample(0, 0), sample(50, 100))).toBeCloseTo(200, 5)
  })

  it('returns undefined when the system delta is zero, rather than dividing by it', () => {
    expect(cpuPercentBetween(sample(10, 100), sample(10, 100))).toBeUndefined()
  })

  it('returns undefined when counters went backwards (container restarted)', () => {
    expect(cpuPercentBetween(sample(90, 100), sample(10, 200))).toBeUndefined()
  })
})

describe('ratesBetween', () => {
  const sample = (at: number, overrides: Record<string, number | undefined> = {}) => ({
    at,
    cpuTotal: 0,
    systemTotal: 0,
    onlineCpus: 1,
    memoryUsed: 0,
    memoryLimit: 0,
    netRx: 0,
    netTx: 0,
    ...overrides
  })

  it('turns cumulative byte counters into per-second rates', () => {
    const rates = ratesBetween(
      sample(1000, { netRx: 1000, netTx: 500, blockRead: 2000, blockWrite: 100 }),
      sample(3000, { netRx: 3000, netTx: 1500, blockRead: 6000, blockWrite: 300 })
    )

    // 2000 bytes over 2 seconds.
    expect(rates.netRxPerSecond).toBe(1000)
    expect(rates.netTxPerSecond).toBe(500)
    expect(rates.blockReadPerSecond).toBe(2000)
    expect(rates.blockWritePerSecond).toBe(100)
  })

  it('reports no disk rate on hosts that do not report block IO at all', () => {
    // Docker Desktop and OrbStack on macOS run containers in a VM and report nothing here.
    const rates = ratesBetween(sample(0, { netRx: 0 }), sample(1000, { netRx: 100 }))
    expect(rates.blockReadPerSecond).toBeUndefined()
    expect(rates.blockWritePerSecond).toBeUndefined()
    expect(rates.netRxPerSecond).toBe(100)
  })

  it('ignores a counter that went backwards, as happens when a container is recreated', () => {
    const rates = ratesBetween(sample(0, { netRx: 5000 }), sample(1000, { netRx: 10 }))
    expect(rates.netRxPerSecond).toBeUndefined()
  })

  it('returns nothing when two samples share a timestamp', () => {
    expect(ratesBetween(sample(500, { netRx: 0 }), sample(500, { netRx: 900 }))).toEqual({})
  })
})

// A throwaway Unix socket server stands in for the daemon, which exercises the real
// http/net paths without needing Docker.
describe('engine transport against a stub socket', () => {
  let dir: string
  let socketPath: string
  let server: net.Server
  let connections: net.Socket[]

  const listen = (handler: (socket: net.Socket, request: string) => void) =>
    new Promise<void>((resolve, reject) => {
      server = net.createServer((socket) => {
        connections.push(socket)
        let request = ''
        socket.on('data', (chunk) => {
          request += chunk.toString()
          if (request.includes('\r\n\r\n')) handler(socket, request)
        })
      })
      // Surface a bind failure instead of letting the test time out on it.
      server.on('error', reject)
      server.listen(socketPath, resolve)
    })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'docker-engine-test-'))
    socketPath = join(dir, 'docker.sock')
    process.env.DOCKER_HOST = `unix://${socketPath}`
    connections = []
    resetDockerEndpointCache()
  })

  afterEach(async () => {
    // A hijacked connection stays open by design, and server.close() waits for it.
    connections.forEach((socket) => socket.destroy())
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
    rmSync(dir, { recursive: true, force: true })
  })

  it('parses a JSON response body', async () => {
    const body = JSON.stringify({
      memory_stats: { usage: 500, limit: 2000, stats: { inactive_file: 100 } },
      networks: { eth0: { rx_bytes: 700, tx_bytes: 200 }, eth1: { rx_bytes: 300 } },
      blkio_stats: {
        io_service_bytes_recursive: [
          { op: 'Read', value: 4096 },
          { op: 'Write', value: 8192 },
          { op: 'Sync', value: 999 }
        ]
      }
    })
    await listen((socket) => {
      socket.end(
        `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`
      )
    })

    const stats = await containerStats('whatever')
    // usage - inactive_file, which is what `docker stats` reports.
    expect(stats.memoryUsed).toBe(400)
    expect(stats.memoryLimit).toBe(2000)
    // Summed across interfaces.
    expect(stats.netRx).toBe(1000)
    expect(stats.netTx).toBe(200)
    // Only the read/write ops; Sync and friends would double-count.
    expect(stats.blockRead).toBe(4096)
    expect(stats.blockWrite).toBe(8192)
  })

  it('leaves block IO undefined when the host reports an empty list', async () => {
    const body = JSON.stringify({
      memory_stats: { usage: 10, limit: 100 },
      blkio_stats: { io_service_bytes_recursive: [] }
    })
    await listen((socket) => {
      socket.end(
        `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`
      )
    })

    const stats = await containerStats('whatever')
    expect(stats.blockRead).toBeUndefined()
    // No networks key at all is normal for network_mode: none.
    expect(stats.netRx).toBe(0)
  })

  it('surfaces a non-200 as DockerEngineUnavailable with the status', async () => {
    await listen((socket) => {
      socket.end('HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n')
    })

    await expect(containerStats('missing')).rejects.toThrow(/HTTP 404/)
  })

  it('hands back bytes that shared the header chunk, and a paused socket', async () => {
    await listen((socket) => {
      socket.write('HTTP/1.1 101 UPGRADED\r\nUpgrade: tcp\r\n\r\nfirst-')
      setTimeout(() => socket.write('second'), 10)
    })

    const { socket, status, initial } = await engineHijack('/exec/abc/start', {
      Detach: false,
      Tty: true
    })
    expect(status).toBe(101)
    // The shell's first prompt arrives with the header and must not be lost.
    expect(initial.toString()).toBe('first-')
    expect(socket.isPaused()).toBe(true)

    const later = await new Promise<string>((resolve) => {
      socket.on('data', (chunk: Buffer) => resolve(chunk.toString()))
      socket.resume()
    })
    expect(later).toBe('second')
    socket.destroy()
  })

  it('rejects an upgrade the daemon refused', async () => {
    await listen((socket) => {
      socket.end('HTTP/1.1 409 Conflict\r\nContent-Length: 0\r\n\r\n')
    })

    await expect(engineHijack('/exec/abc/start', {})).rejects.toThrow(/HTTP 409/)
  })

  it('explains a missing socket instead of leaking ENOENT', async () => {
    process.env.DOCKER_HOST = `unix://${join(dir, 'not-there.sock')}`
    resetDockerEndpointCache()
    await expect(engineRequest('GET', '/_ping')).rejects.toThrow(/Is Docker running\?/)
  })
})

describe('remote endpoints', () => {
  it('refuse to open a stream, naming the reason', async () => {
    process.env.DOCKER_HOST = 'tcp://10.0.4.19:2376'
    resetDockerEndpointCache()
    await expect(engineHijack('/exec/abc/start', {})).rejects.toBeInstanceOf(
      DockerEngineUnavailable
    )
    await expect(engineHijack('/exec/abc/start', {})).rejects.toThrow(/remote daemon/)
  })
})
