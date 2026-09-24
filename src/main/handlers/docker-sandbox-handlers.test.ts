import fs from 'fs'
import os from 'os'
import path from 'path'

const openPath = jest.fn<Promise<string>, [string]>()
const openExternal = jest.fn<Promise<void>, [string]>()

jest.mock('electron', () => ({
  shell: {
    openPath: (target: string) => openPath(target),
    openExternal: (target: string) => openExternal(target)
  }
}))

const getStatus = jest.fn()
const isPublishedPort = jest.fn()
const resolveTerminalTarget = jest.fn()
const openTerminal = jest.fn()
const findSessionTerminal = jest.fn()

jest.mock('../api/docker', () => ({
  attachTerminal: jest.fn(),
  closeTerminal: jest.fn(),
  createSandbox: jest.fn(),
  execCommand: jest.fn(),
  findSessionTerminal: (sessionId: string) => findSessionTerminal(sessionId),
  getActivity: jest.fn(),
  getAvailability: jest.fn(),
  getInsights: jest.fn(),
  getLogs: jest.fn(),
  getStatus: (sessionId: string) => getStatus(sessionId),
  getTerminalBacklog: jest.fn(),
  getTerminalCapability: jest.fn(),
  isPublishedPort: (sessionId: string, port: number) => isPublishedPort(sessionId, port),
  isTrackedSandboxPid: jest.fn(),
  listSandboxSessionIds: jest.fn(),
  openTerminal: (...args: unknown[]) => openTerminal(...args),
  removeSandbox: jest.fn(),
  renameSandbox: jest.fn(),
  resizeTerminal: jest.fn(),
  resolveTerminalTarget: (sessionId: string, service?: string) =>
    resolveTerminalTarget(sessionId, service),
  sendInput: jest.fn(),
  startSandbox: jest.fn(),
  stopSandbox: jest.fn(),
  writeToTerminal: jest.fn()
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { dockerSandboxHandlers } =
  require('./docker-sandbox-handlers') as typeof import('./docker-sandbox-handlers')

const openFolder = (sessionId: string) =>
  dockerSandboxHandlers['docker-sandbox-open-folder'](null as any, { sessionId })

describe('docker-sandbox-open-folder', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-openfolder-'))
    openPath.mockReset()
    getStatus.mockReset()
    // shell.openPath resolves to '' on success, never throws.
    openPath.mockResolvedValue('')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('opens the sandbox directory and reports the path', async () => {
    getStatus.mockResolvedValue({ exists: true, metadata: { directory: tmpDir } })

    const result = await openFolder('session_1')

    expect(openPath).toHaveBeenCalledWith(tmpDir)
    expect(result).toEqual({ success: true, path: tmpDir })
  })

  it('fails clearly when the chat has no sandbox', async () => {
    getStatus.mockResolvedValue({ exists: false, state: 'missing', containers: [] })

    const result = await openFolder('session_1')

    expect(openPath).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no sandbox folder yet/)
  })

  it('fails clearly when the folder was deleted outside the app', async () => {
    const missing = path.join(tmpDir, 'gone')
    getStatus.mockResolvedValue({ exists: true, metadata: { directory: missing } })

    const result = await openFolder('session_1')

    expect(openPath).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.error).toContain(missing)
  })

  it('surfaces the platform error when the OS cannot open the folder', async () => {
    // What Linux returns with no xdg-utils / no file manager installed.
    openPath.mockResolvedValue('Failed to open path')
    getStatus.mockResolvedValue({ exists: true, metadata: { directory: tmpDir } })

    const result = await openFolder('session_1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('Failed to open path')
    expect(result.error).toContain(tmpDir)
  })

  it('passes the directory through verbatim, so platform path separators are preserved', async () => {
    // A Windows-shaped path must reach shell.openPath unaltered; nothing in the handler
    // should normalize or re-join it.
    const windowsPath = 'C:\\Users\\dev\\project\\docker-sandboxes\\fix-auth-a3f21c'
    const existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(true)
    getStatus.mockResolvedValue({ exists: true, metadata: { directory: windowsPath } })

    try {
      const result = await openFolder('session_1')
      expect(openPath).toHaveBeenCalledWith(windowsPath)
      expect(result).toEqual({ success: true, path: windowsPath })
    } finally {
      existsSpy.mockRestore()
    }
  })
})

const openPort = (sessionId: string, port: number) =>
  dockerSandboxHandlers['docker-sandbox-open-port'](null as any, { sessionId, port })

describe('docker-sandbox-open-port', () => {
  beforeEach(() => {
    openExternal.mockReset()
    openExternal.mockResolvedValue(undefined)
    isPublishedPort.mockReset()
  })

  it('opens a port the sandbox publishes', async () => {
    isPublishedPort.mockReturnValue(true)

    const result = await openPort('session_1', 3000)

    expect(openExternal).toHaveBeenCalledWith('http://localhost:3000')
    expect(result).toEqual({ success: true, url: 'http://localhost:3000' })
  })

  it('refuses a port this sandbox does not publish', async () => {
    // Otherwise the renderer could use the main process to reach anything on localhost.
    isPublishedPort.mockReturnValue(false)

    const result = await openPort('session_1', 8080)

    expect(openExternal).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/not published/)
  })

  it.each([0, -1, 70000, 1.5, NaN])('refuses %p as a port number', async (port) => {
    const result = await openPort('session_1', port as number)

    expect(openExternal).not.toHaveBeenCalled()
    expect(isPublishedPort).not.toHaveBeenCalled()
    expect(result.success).toBe(false)
  })
})

describe('docker-sandbox-terminal-open', () => {
  beforeEach(() => {
    resolveTerminalTarget.mockReset()
    openTerminal.mockReset()
    findSessionTerminal.mockReset()
    findSessionTerminal.mockReturnValue(undefined)
    resolveTerminalTarget.mockResolvedValue({
      sessionId: 'session_1',
      service: 'main',
      containerName: 'bedrock-sandbox-session-1-main-1'
    })
    openTerminal.mockResolvedValue({
      terminalId: 't1',
      channel: 'docker-sandbox:terminal:t1',
      cols: 80,
      rows: 24
    })
  })

  it('resolves the container in the main process from the session id alone', async () => {
    await dockerSandboxHandlers['docker-sandbox-terminal-open'](null as any, {
      sessionId: 'session_1',
      cols: 100,
      rows: 30
    })

    expect(resolveTerminalTarget).toHaveBeenCalledWith('session_1', undefined)
    expect(openTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ containerName: 'bedrock-sandbox-session-1-main-1' }),
      100,
      30
    )
  })

  it('ignores any container name the renderer tries to supply', async () => {
    // The guard that matters: a container name from the renderer would turn an XSS in
    // rendered markdown into a root shell in any container on the machine.
    await dockerSandboxHandlers['docker-sandbox-terminal-open'](
      null as any,
      {
        sessionId: 'session_1',
        containerName: 'someone-elses-postgres'
      } as any
    )

    expect(openTerminal).toHaveBeenCalledWith(
      expect.objectContaining({ containerName: 'bedrock-sandbox-session-1-main-1' }),
      80,
      24
    )
    const [[target]] = openTerminal.mock.calls
    expect(JSON.stringify(target)).not.toContain('someone-elses-postgres')
  })

  it('propagates the rejection for a service that is not part of the sandbox', async () => {
    resolveTerminalTarget.mockRejectedValue(new Error('Service "db" is not part of this sandbox.'))

    await expect(
      dockerSandboxHandlers['docker-sandbox-terminal-open'](null as any, {
        sessionId: 'session_1',
        service: 'db'
      })
    ).rejects.toThrow(/not part of this sandbox/)
    expect(openTerminal).not.toHaveBeenCalled()
  })

  it('reuses the chat existing shell instead of opening a second one', async () => {
    findSessionTerminal.mockReturnValue({
      terminalId: 'existing',
      channel: 'docker-sandbox:terminal:existing',
      cols: 80,
      rows: 24
    })

    const result = await dockerSandboxHandlers['docker-sandbox-terminal-open'](null as any, {
      sessionId: 'session_1'
    })

    expect(result.terminalId).toBe('existing')
    expect(openTerminal).not.toHaveBeenCalled()
    expect(resolveTerminalTarget).not.toHaveBeenCalled()
  })
})
