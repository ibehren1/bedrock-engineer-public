import fs from 'fs'
import os from 'os'
import path from 'path'

const openPath = jest.fn<Promise<string>, [string]>()

jest.mock('electron', () => ({
  shell: { openPath: (target: string) => openPath(target) }
}))

const getStatus = jest.fn()

jest.mock('../api/docker', () => ({
  createSandbox: jest.fn(),
  execCommand: jest.fn(),
  getAvailability: jest.fn(),
  getLogs: jest.fn(),
  getStatus: (sessionId: string) => getStatus(sessionId),
  isTrackedSandboxPid: jest.fn(),
  listSandboxSessionIds: jest.fn(),
  removeSandbox: jest.fn(),
  renameSandbox: jest.fn(),
  sendInput: jest.fn(),
  startSandbox: jest.fn(),
  stopSandbox: jest.fn()
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
