/**
 * Integration tests for the per-chat Docker sandbox. Requires a working Docker
 * installation; every test skips when Docker is unavailable.
 *
 * Run with: npm run test:integration
 */

import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { checkDockerAvailability } from './dockerAvailability'
import { toFolderName, toProjectName } from './naming'
import { DEFAULT_SANDBOX_IMAGE, WORKSPACE_MOUNT } from './types'

// The manager reads projectPath from the electron store, so point the store at a temp
// directory before importing it.
const tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-integration-'))

// Sandbox folders are named from the chat title, which the manager reads out of the chat
// session file under userDataPath. Point that at a temp dir the tests can write.
const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-userdata-'))

jest.mock('../../../preload/store', () => ({
  store: {
    get: (key: string) => {
      if (key === 'projectPath') return tmpProject
      if (key === 'userDataPath') return tmpUserData
      if (key === 'dockerSandboxTool') return { memoryLimit: '512m', cpuLimit: 1.0, timeout: 120 }
      return undefined
    },
    set: () => {}
  }
}))

/** Write the chat session file the way ChatSessionManager does, so a title is resolvable. */
const setChatTitle = (sessionId: string, title: string): void => {
  const dir = path.join(tmpUserData, 'chat-sessions')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, `${sessionId}.json`),
    JSON.stringify({ id: sessionId, title, messages: [] }),
    'utf-8'
  )
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const manager = require('./sandboxManager') as typeof import('./sandboxManager')

const SESSION_ID = `session_${Date.now()}`
let dockerReady = false

const isPortOpen = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = net.createConnection({ port, host: '127.0.0.1' })
    socket.setTimeout(3000)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
    socket.once('timeout', () => {
      socket.destroy()
      resolve(false)
    })
  })

beforeAll(async () => {
  const availability = await checkDockerAvailability()
  dockerReady = availability.dockerInstalled && availability.daemonRunning

  if (!dockerReady) {
    console.warn(`Skipping sandbox integration tests: ${availability.error}`)
  }
}, 60_000)

afterAll(async () => {
  if (dockerReady) {
    await manager.removeSandbox(SESSION_ID, { deleteData: true }).catch(() => {})
    await manager.removeSandbox(`${SESSION_ID}_ports`, { deleteData: true }).catch(() => {})
  }
  fs.rmSync(tmpProject, { recursive: true, force: true })
  fs.rmSync(tmpUserData, { recursive: true, force: true })
}, 120_000)

describe('sandbox lifecycle', () => {
  it('creates a sandbox on first exec and reports it as running', async () => {
    if (!dockerReady) return

    const result = await manager.execCommand(SESSION_ID, 'echo hello-from-sandbox')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('hello-from-sandbox')

    const status = await manager.getStatus(SESSION_ID)
    expect(status.exists).toBe(true)
    expect(status.state).toBe('running')
    expect(status.metadata?.projectName).toBe(toProjectName(SESSION_ID))
    expect(status.metadata?.services[0].image).toBe(DEFAULT_SANDBOX_IMAGE)
  }, 600_000)

  it('writes compose, env, and gitignore files under the project directory', async () => {
    if (!dockerReady) return

    const dir = manager.getSandboxDir(SESSION_ID)
    expect(fs.existsSync(path.join(dir, 'docker-compose.yml'))).toBe(true)
    expect(fs.existsSync(path.join(dir, '.env'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'sandbox.json'))).toBe(true)

    // The sandbox root sits inside the user's project, so it must be git-ignored.
    const gitignore = path.join(manager.getSandboxRoot(), '.gitignore')
    expect(fs.readFileSync(gitignore, 'utf-8')).toContain('*')
  }, 60_000)

  it('mounts the project directory at /workspace, read-write both ways', async () => {
    if (!dockerReady) return

    // Host file visible inside the container.
    fs.writeFileSync(path.join(tmpProject, 'from-host.txt'), 'host-content', 'utf-8')
    const read = await manager.execCommand(SESSION_ID, `cat ${WORKSPACE_MOUNT}/from-host.txt`)
    expect(read.stdout).toContain('host-content')

    // Container file visible on the host.
    await manager.execCommand(
      SESSION_ID,
      `echo container-content > ${WORKSPACE_MOUNT}/from-container.txt`
    )
    expect(fs.readFileSync(path.join(tmpProject, 'from-container.txt'), 'utf-8')).toContain(
      'container-content'
    )
  }, 120_000)

  it('persists files written to /data on the host under the sandbox data folder', async () => {
    if (!dockerReady) return

    await manager.execCommand(SESSION_ID, 'echo persisted > /data/note.txt')

    const hostPath = path.join(manager.getSandboxDir(SESSION_ID), 'data', 'main', 'note.txt')
    expect(fs.readFileSync(hostPath, 'utf-8')).toContain('persisted')
  }, 120_000)

  it('has network access, so apt can install packages', async () => {
    if (!dockerReady) return

    const result = await manager.execCommand(
      SESSION_ID,
      'apt-get update -qq && apt-get install -y -qq curl && curl --version',
      { timeout: 480 }
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('curl')
  }, 600_000)

  it('keeps installed packages across a stop and start', async () => {
    if (!dockerReady) return

    await manager.stopSandbox(SESSION_ID)
    expect((await manager.getStatus(SESSION_ID)).state).toBe('stopped')

    await manager.startSandbox(SESSION_ID)
    expect((await manager.getStatus(SESSION_ID)).state).toBe('running')

    // curl was installed in the previous test; the container is not rebuilt.
    const result = await manager.execCommand(SESSION_ID, 'command -v curl')
    expect(result.exitCode).toBe(0)
  }, 600_000)

  it('answers an interactive prompt through a stdin follow-up', async () => {
    if (!dockerReady) return

    // No -y, so apt asks for confirmation and the exec returns early with a PID.
    const first = await manager.execCommand(
      SESSION_ID,
      'unset DEBIAN_FRONTEND; apt-get install less',
      { timeout: 240 }
    )

    if (!first.requiresInput) {
      // apt sometimes has nothing to confirm (already satisfied); nothing to assert.
      return
    }

    expect(first.processInfo?.pid).toBeGreaterThan(0)
    expect(first.prompt).toBeTruthy()

    const second = await manager.sendInput(first.processInfo!.pid, 'Y')
    expect(second).toBeDefined()
  }, 600_000)

  it('rejects a stdin follow-up for an unknown PID with an actionable message', async () => {
    if (!dockerReady) return

    await expect(manager.sendInput(999_999, 'Y')).rejects.toThrow(
      /No running sandbox command found/
    )
  }, 30_000)

  it('starts a detached process and exposes its output through logs', async () => {
    if (!dockerReady) return

    const detached = await manager.execCommand(
      SESSION_ID,
      'sh -c "echo detached-marker >> /proc/1/fd/1"',
      { detach: true }
    )
    expect(detached.exitCode).toBe(0)

    // Give the write a moment to reach the container's stdout.
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const logs = await manager.getLogs(SESSION_ID, { tail: 50 })
    expect(`${logs.stdout}${logs.stderr}`).toContain('detached-marker')
  }, 180_000)

  it('reports a helpful error for an unknown service', async () => {
    if (!dockerReady) return

    await expect(manager.execCommand(SESSION_ID, 'true', { service: 'nope' })).rejects.toThrow(
      /is not part of this sandbox/
    )
  }, 60_000)
})

describe('published ports', () => {
  const portSession = `${process.env.JEST_WORKER_ID ?? '1'}`
  const sessionId = `session_${Date.now()}_ports`
  const hostPort = 38_411

  afterAll(async () => {
    if (dockerReady) {
      await manager.removeSandbox(sessionId, { deleteData: true }).catch(() => {})
    }
  }, 120_000)

  it('makes a declared port reachable from the host', async () => {
    if (!dockerReady) return
    expect(portSession).toBeTruthy()

    await manager.createSandbox(sessionId, {
      services: [
        {
          name: 'main',
          ports: [{ host: hostPort, container: 8000 }]
        }
      ]
    })

    // python3 is not in bare ubuntu, so serve with a plain shell listener instead.
    await manager.execCommand(
      sessionId,
      'apt-get update -qq && apt-get install -y -qq netcat-openbsd',
      { timeout: 480 }
    )
    await manager.execCommand(
      sessionId,
      'nohup sh -c \'while true; do printf "HTTP/1.1 200 OK\\r\\nContent-Length: 2\\r\\n\\r\\nok" | nc -l -p 8000 -q 1; done\' >/dev/null 2>&1 &',
      { detach: true }
    )

    // Give the listener a moment to bind.
    await new Promise((resolve) => setTimeout(resolve, 3000))

    expect(await isPortOpen(hostPort)).toBe(true)
  }, 600_000)
})

describe('human-readable folder naming', () => {
  const sessionId = `session_${Date.now()}_named`

  afterAll(async () => {
    if (dockerReady) {
      await manager.removeSandbox(sessionId, { deleteData: true }).catch(() => {})
    }
  }, 120_000)

  it('names the folder from the chat title at creation', async () => {
    if (!dockerReady) return

    setChatTitle(sessionId, 'Fix the auth bug')
    await manager.createSandbox(sessionId)

    const dir = manager.getSandboxDir(sessionId)
    expect(path.basename(dir)).toBe(toFolderName(sessionId, 'Fix the auth bug'))
    expect(path.basename(dir)).toMatch(/^fix-the-auth-bug-[0-9a-f]{6}$/)
  }, 600_000)

  it('renames the folder when the chat title changes, keeping the container and its packages', async () => {
    if (!dockerReady) return

    // Leave a marker inside the container so we can prove it was never recreated.
    await manager.execCommand(sessionId, 'touch /marker-before-rename')

    const before = manager.getSandboxDir(sessionId)
    const beforeContainers = (await manager.getStatus(sessionId)).containers.map((c) => c.name)

    setChatTitle(sessionId, 'Rework the login flow')
    const result = await manager.renameSandbox(sessionId)
    expect(result.renamed).toBe(true)

    const after = manager.getSandboxDir(sessionId)
    expect(path.basename(after)).toMatch(/^rework-the-login-flow-[0-9a-f]{6}$/)
    expect(fs.existsSync(before)).toBe(false)
    expect(fs.existsSync(path.join(after, 'docker-compose.yml'))).toBe(true)

    // Compose still tracks the same containers, because the project name never moved.
    const status = await manager.getStatus(sessionId)
    expect(status.state).toBe('running')
    expect(status.containers.map((c) => c.name)).toEqual(beforeContainers)

    // Same container, not a fresh one.
    const marker = await manager.execCommand(sessionId, 'test -f /marker-before-rename')
    expect(marker.exitCode).toBe(0)
  }, 600_000)

  it('still resolves the sandbox by session id after the folder moved', async () => {
    if (!dockerReady) return

    expect(manager.listSandboxSessionIds()).toContain(sessionId)

    const status = await manager.getStatus(sessionId)
    expect(status.exists).toBe(true)
    expect(status.metadata?.sessionId).toBe(sessionId)
    // Metadata paths track the folder's real location, not where it was written.
    expect(status.metadata?.directory).toBe(manager.getSandboxDir(sessionId))
  }, 120_000)

  it('data written before the rename moves with the folder', async () => {
    if (!dockerReady) return

    await manager.execCommand(sessionId, 'echo survived > /data/rename-check.txt')

    const hostPath = path.join(manager.getSandboxDir(sessionId), 'data', 'main', 'rename-check.txt')
    expect(fs.readFileSync(hostPath, 'utf-8')).toContain('survived')
  }, 120_000)

  it('is a no-op when the title has not changed', async () => {
    if (!dockerReady) return

    const result = await manager.renameSandbox(sessionId)
    expect(result.renamed).toBe(false)
  }, 120_000)

  it('refuses to rename onto a folder another chat already owns', async () => {
    if (!dockerReady) return

    const otherId = `session_${Date.now()}_collision`
    const occupied = path.join(manager.getSandboxRoot(), toFolderName(otherId, 'Taken name'))
    fs.mkdirSync(occupied, { recursive: true })

    try {
      // A different session's desired folder cannot collide by construction (the short id
      // differs), so occupy this session's own target to exercise the guard.
      const target = path.join(
        manager.getSandboxRoot(),
        toFolderName(sessionId, 'Something else entirely')
      )
      fs.mkdirSync(target, { recursive: true })

      const before = manager.getSandboxDir(sessionId)
      setChatTitle(sessionId, 'Something else entirely')
      const result = await manager.renameSandbox(sessionId)

      expect(result.renamed).toBe(false)
      expect(manager.getSandboxDir(sessionId)).toBe(before)

      fs.rmSync(target, { recursive: true, force: true })
    } finally {
      fs.rmSync(occupied, { recursive: true, force: true })
    }
  }, 120_000)
})

describe('teardown', () => {
  it('removing without deleteData keeps the folder but drops the sandbox', async () => {
    if (!dockerReady) return

    const sessionId = `session_${Date.now()}_keep`
    await manager.createSandbox(sessionId)
    const dir = manager.getSandboxDir(sessionId)

    const result = await manager.removeSandbox(sessionId, { deleteData: false })
    expect(result.removed).toBe(true)
    expect(result.dataDeleted).toBe(false)

    // Files survive for recovery, but the sandbox no longer counts as existing.
    expect(fs.existsSync(path.join(dir, 'docker-compose.yml'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'sandbox.json'))).toBe(false)
    expect((await manager.getStatus(sessionId)).exists).toBe(false)

    fs.rmSync(dir, { recursive: true, force: true })
  }, 600_000)

  it('removing with deleteData deletes the whole folder', async () => {
    if (!dockerReady) return

    const sessionId = `session_${Date.now()}_wipe`
    await manager.createSandbox(sessionId)
    const dir = manager.getSandboxDir(sessionId)

    const result = await manager.removeSandbox(sessionId, { deleteData: true })
    expect(result.dataDeleted).toBe(true)
    expect(fs.existsSync(dir)).toBe(false)
  }, 600_000)

  it('lists only sessions that still have a sandbox', async () => {
    if (!dockerReady) return

    const sessionId = `session_${Date.now()}_listed`
    await manager.createSandbox(sessionId)

    expect(manager.listSandboxSessionIds()).toContain(sessionId)

    await manager.removeSandbox(sessionId, { deleteData: true })
    expect(manager.listSandboxSessionIds()).not.toContain(sessionId)
  }, 600_000)
})

// eslint-disable-next-line @typescript-eslint/no-var-requires
const terminal = require('./sandboxTerminal') as typeof import('./sandboxTerminal')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const activity = require('./sandboxActivity') as typeof import('./sandboxActivity')

/** Collect terminal output by subscribing to the pubsub channel the panel would use. */
const captureTerminal = (channel: string) => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { pubSubManager } = require('../../lib/pubsub-manager') as {
    pubSubManager: { publish: (channel: string, data: unknown) => void }
  }
  const chunks: Buffer[] = []
  let exitCode: number | null | undefined
  const original = pubSubManager.publish.bind(pubSubManager)

  pubSubManager.publish = (publishedChannel: string, data: any) => {
    if (publishedChannel === channel) {
      if (data?.type === 'data') chunks.push(Buffer.from(data.bytes))
      if (data?.type === 'exit') exitCode = data.exitCode
    }
    return original(publishedChannel, data)
  }

  return {
    text: () => Buffer.concat(chunks).toString('utf-8'),
    exitCode: () => exitCode,
    restore: () => {
      pubSubManager.publish = original
    }
  }
}

const waitFor = async (predicate: () => boolean, timeoutMs = 10_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 60))
  }
  throw new Error('Timed out waiting for terminal output')
}

describe('interactive terminal', () => {
  const sessionId = `session_${Date.now()}_term`
  let capture: ReturnType<typeof captureTerminal> | undefined

  afterAll(async () => {
    if (!dockerReady) return
    capture?.restore()
    terminal.closeSessionTerminals(sessionId)
    await manager.removeSandbox(sessionId, { deleteData: true }).catch(() => {})
  }, 120_000)

  it('delivers a shell prompt without any input being sent', async () => {
    if (!dockerReady) return

    // The panel showed an empty black pane at first. The cause was in the renderer, but
    // this pins the contract the renderer relies on: the prompt is produced on open, and
    // reaches a subscriber that attaches a moment later.
    await manager.createSandbox(sessionId)
    const target = await manager.resolveTerminalTarget(sessionId)
    const opened = await terminal.openTerminal(target, 80, 24)
    const watch = captureTerminal(opened.channel)

    try {
      const { backlog } = terminal.attachTerminal(opened.terminalId)
      await waitFor(() => (Buffer.from(backlog).toString() + watch.text()).includes('#'))

      const seen = Buffer.from(backlog).toString() + watch.text()
      expect(seen).toMatch(/root@[0-9a-f]+:\/workspace#/)
    } finally {
      watch.restore()
      terminal.closeSessionTerminals(sessionId)
    }
  }, 600_000)

  it('refuses to open a shell when the container is not running', async () => {
    if (!dockerReady) return

    // This is what spun: Docker accepts an exec against a stopped container, the stream
    // carries "OCI runtime exec failed" and exits 128, and the caller retried at once.
    await manager.createSandbox(sessionId)
    const target = await manager.resolveTerminalTarget(sessionId)
    await manager.stopSandbox(sessionId)

    await expect(terminal.openTerminal(target, 80, 24)).rejects.toThrow(/not running|exited/i)
    expect(terminal.findSessionTerminal(sessionId)).toBeUndefined()

    await manager.startSandbox(sessionId)
  }, 600_000)

  it('runs a command, honours resize, and handles Ctrl-C without killing the shell', async () => {
    if (!dockerReady) return

    await manager.createSandbox(sessionId)
    const target = await manager.resolveTerminalTarget(sessionId)
    const opened = await terminal.openTerminal(target, 80, 24)

    capture = captureTerminal(opened.channel)
    terminal.attachTerminal(opened.terminalId)

    terminal.writeToTerminal(opened.terminalId, 'echo terminal-works\n')
    await waitFor(() => capture!.text().includes('terminal-works'))

    // A Tty exec can be resized, and the shell inside sees the new size.
    await terminal.resizeTerminal(opened.terminalId, 40, 10)
    terminal.writeToTerminal(opened.terminalId, 'stty size\n')
    await waitFor(() => /10\s+40/.test(capture!.text()))

    // Ctrl-C must interrupt the running command, not end the session.
    terminal.writeToTerminal(opened.terminalId, 'sleep 30\n')
    await new Promise((resolve) => setTimeout(resolve, 400))
    terminal.writeToTerminal(opened.terminalId, '\x03')
    terminal.writeToTerminal(opened.terminalId, 'echo still-alive\n')
    await waitFor(() => capture!.text().includes('still-alive'))

    expect(capture!.exitCode()).toBeUndefined()
  }, 600_000)

  it('reports an exit when the shell ends', async () => {
    if (!dockerReady) return

    const target = await manager.resolveTerminalTarget(sessionId)
    const opened = await terminal.openTerminal(target, 80, 24)
    const watch = captureTerminal(opened.channel)
    terminal.attachTerminal(opened.terminalId)

    try {
      terminal.writeToTerminal(opened.terminalId, 'exit\n')
      await waitFor(() => watch.exitCode() !== undefined, 15_000)
      expect(watch.exitCode()).toBe(0)
    } finally {
      watch.restore()
    }
  }, 600_000)

  it('closes the terminal when the sandbox is stopped', async () => {
    if (!dockerReady) return

    await manager.startSandbox(sessionId)
    const target = await manager.resolveTerminalTarget(sessionId)
    const opened = await terminal.openTerminal(target, 80, 24)
    expect(terminal.findSessionTerminal(sessionId)?.terminalId).toBe(opened.terminalId)

    await manager.stopSandbox(sessionId)

    expect(terminal.findSessionTerminal(sessionId)).toBeUndefined()
  }, 600_000)

  it('refuses a service that is not part of the sandbox', async () => {
    if (!dockerReady) return

    await expect(manager.resolveTerminalTarget(sessionId, 'not-a-service')).rejects.toThrow(
      /not part of this sandbox/
    )
  }, 120_000)
})

describe('insights and activity', () => {
  const sessionId = `session_${Date.now()}_insights`

  afterAll(async () => {
    if (!dockerReady) return
    await manager.removeSandbox(sessionId, { deleteData: true }).catch(() => {})
  }, 120_000)

  it('reports the image, uptime and resource use of a running container', async () => {
    if (!dockerReady) return

    await manager.execCommand(sessionId, 'echo warm')

    const first = await manager.getInsights(sessionId)
    expect(first.image).toBe(DEFAULT_SANDBOX_IMAGE)
    expect(first.status).toBe('running')
    expect(Date.parse(first.startedAt ?? '')).not.toBeNaN()
    expect(first.memoryLimit).toBeGreaterThan(0)
    // A CPU percentage needs two samples, so the first call cannot report one.
    expect(first.cpuPercent).toBeUndefined()

    const second = await manager.getInsights(sessionId)
    expect(second.cpuPercent).toBeGreaterThanOrEqual(0)
  }, 600_000)

  it('reports network counters, and disk counters where the host provides them', async () => {
    if (!dockerReady) return

    await manager.execCommand(sessionId, 'echo warm')
    // Written to /tmp, i.e. the container's own writable layer, deliberately: IO against a
    // bind mount like /workspace or /data is the host's filesystem and is not attributed to
    // the container's cgroup, so it never appears in these counters.
    await manager.execCommand(
      sessionId,
      'dd if=/dev/zero of=/tmp/probe.bin bs=1M count=20 2>/dev/null; sync; cat /tmp/probe.bin > /dev/null'
    )

    await manager.getInsights(sessionId)
    // Rates need two samples, and bytes need a moment to be accounted.
    await new Promise((resolve) => setTimeout(resolve, 1200))
    const insights = await manager.getInsights(sessionId)

    expect(insights.netRx).toBeGreaterThanOrEqual(0)
    expect(insights.netTx).toBeGreaterThanOrEqual(0)
    expect(insights.netRxPerSecond).toBeGreaterThanOrEqual(0)

    if (insights.blockWrite === undefined) {
      // Some hosts (Docker Desktop on macOS among them) report no block IO at all; the
      // panel says so rather than showing a misleading zero.
      expect(insights.blockRead).toBeUndefined()
      return
    }
    expect(insights.blockWrite).toBeGreaterThan(0)
    expect(insights.blockWritePerSecond).toBeGreaterThanOrEqual(0)
  }, 600_000)

  it('records each command as start, settled and exit, and persists it', async () => {
    if (!dockerReady) return

    await manager.execCommand(sessionId, 'echo recorded-command')
    await activity.flushActivityWrites()

    const entries = await activity.getActivity(sessionId)
    const entry = entries.find((item) => item.command === 'echo recorded-command')
    expect(entry).toBeDefined()
    expect(entry?.outcome).toBe('completed')
    expect(entry?.exitCode).toBe(0)
    expect(entry?.endedAt).toBeDefined()
    expect(entry?.source).toBe('agent')

    // The same rows are on disk in the sandbox folder.
    const file = path.join(manager.getSandboxDir(sessionId), activity.ACTIVITY_FILENAME)
    expect(fs.readFileSync(file, 'utf-8')).toContain('echo recorded-command')
  }, 600_000)
})

describe('multi-service compose stacks', () => {
  const sessionId = `session_${Date.now()}_stack`

  afterAll(async () => {
    if (!dockerReady) return
    terminal.closeSessionTerminals(sessionId)
    await manager.removeSandbox(sessionId, { deleteData: true }).catch(() => {})
  }, 180_000)

  it('gives every service in the stack its own shell, and exposes the compose file', async () => {
    if (!dockerReady) return

    await manager.createSandbox(sessionId, {
      services: [
        { name: 'main', image: DEFAULT_SANDBOX_IMAGE },
        { name: 'sidecar', image: DEFAULT_SANDBOX_IMAGE }
      ]
    })

    const compose = await manager.getComposeFile(sessionId)
    expect(compose.composeless).toBe(false)
    expect(compose.contents).toContain('main:')
    expect(compose.contents).toContain('sidecar:')
    expect(compose.path).toMatch(/docker-compose\.yml$/)

    // One shell per container, each attached to its own.
    const mainTarget = await manager.resolveTerminalTarget(sessionId, 'main')
    const sidecarTarget = await manager.resolveTerminalTarget(sessionId, 'sidecar')
    expect(mainTarget.containerName).not.toBe(sidecarTarget.containerName)

    const mainTerminal = await terminal.openTerminal(mainTarget, 80, 24)
    const sidecarTerminal = await terminal.openTerminal(sidecarTarget, 80, 24)
    expect(sidecarTerminal.terminalId).not.toBe(mainTerminal.terminalId)

    const watchMain = captureTerminal(mainTerminal.channel)
    const watchSidecar = captureTerminal(sidecarTerminal.channel)

    try {
      terminal.attachTerminal(mainTerminal.terminalId)
      terminal.attachTerminal(sidecarTerminal.terminalId)

      // `hostname` is the container id, so this proves the two shells are in different
      // containers rather than both attached to the same one.
      terminal.writeToTerminal(mainTerminal.terminalId, 'hostname\n')
      terminal.writeToTerminal(sidecarTerminal.terminalId, 'hostname\n')
      await waitFor(() => watchMain.text().length > 0 && watchSidecar.text().length > 0, 15_000)
      await new Promise((resolve) => setTimeout(resolve, 600))

      const mainHost = /([0-9a-f]{12})/.exec(watchMain.text())?.[1]
      const sidecarHost = /([0-9a-f]{12})/.exec(watchSidecar.text())?.[1]
      expect(mainHost).toBeDefined()
      expect(sidecarHost).toBeDefined()
      expect(mainHost).not.toBe(sidecarHost)
    } finally {
      watchMain.restore()
      watchSidecar.restore()
    }
  }, 900_000)
})
