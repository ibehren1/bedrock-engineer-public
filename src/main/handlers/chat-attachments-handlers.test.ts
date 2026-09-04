const openPath = jest.fn<Promise<string>, [string]>()
const showOpenDialog = jest.fn()

jest.mock('electron', () => ({
  shell: { openPath: (target: string) => openPath(target) },
  dialog: { showOpenDialog: (...args: unknown[]) => showOpenDialog(...args) },
  BrowserWindow: { fromWebContents: () => null }
}))

const ensureAttachmentsDir = jest.fn<string, [string]>()
const listAttachments = jest.fn()
const addAttachmentsFromPaths = jest.fn()

jest.mock('../api/attachments', () => ({
  addAttachments: jest.fn(),
  addAttachmentsFromPaths: (...args: unknown[]) => addAttachmentsFromPaths(...args),
  buildAttachmentContext: jest.fn(),
  ensureAttachmentsDir: (sessionId: string) => ensureAttachmentsDir(sessionId),
  listAttachments: (sessionId: string) => listAttachments(sessionId),
  removeAllAttachments: jest.fn(),
  removeAttachment: jest.fn(),
  removeEveryAttachmentsFolder: jest.fn(),
  renameAttachmentsDir: jest.fn()
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chatAttachmentsHandlers } =
  require('./chat-attachments-handlers') as typeof import('./chat-attachments-handlers')

/** The handlers ignore the IPC event, apart from resolving the parent window. */
const ipcEvent = {} as never

beforeEach(() => {
  openPath.mockReset()
  showOpenDialog.mockReset()
  ensureAttachmentsDir.mockReset()
  listAttachments.mockReset()
  addAttachmentsFromPaths.mockReset()
})

describe('chat-attachments-open-folder', () => {
  it('opens the chat folder, creating it first so the menu item always works', async () => {
    ensureAttachmentsDir.mockReturnValue('/project/attachments/fix-auth-a3f21c')
    openPath.mockResolvedValue('')

    const result = await chatAttachmentsHandlers['chat-attachments-open-folder'](ipcEvent, {
      sessionId: 'session_1'
    })

    expect(openPath).toHaveBeenCalledWith('/project/attachments/fix-auth-a3f21c')
    expect(result).toEqual({ success: true, path: '/project/attachments/fix-auth-a3f21c' })
  })

  it('passes a Windows path through verbatim', async () => {
    ensureAttachmentsDir.mockReturnValue('C:\\projects\\demo\\attachments\\chat-a3f21c')
    openPath.mockResolvedValue('')

    await chatAttachmentsHandlers['chat-attachments-open-folder'](ipcEvent, {
      sessionId: 'session_1'
    })

    expect(openPath).toHaveBeenCalledWith('C:\\projects\\demo\\attachments\\chat-a3f21c')
  })

  it('reports why the folder could not be created', async () => {
    ensureAttachmentsDir.mockImplementation(() => {
      throw new Error('No project directory is configured.')
    })

    const result = await chatAttachmentsHandlers['chat-attachments-open-folder'](ipcEvent, {
      sessionId: 'session_1'
    })

    expect(result).toEqual({ success: false, error: 'No project directory is configured.' })
    expect(openPath).not.toHaveBeenCalled()
  })

  it('wraps openPath failure, which is a returned string rather than a throw', async () => {
    ensureAttachmentsDir.mockReturnValue('/project/attachments/chat-a3f21c')
    openPath.mockResolvedValue('no file manager found')

    const result = await chatAttachmentsHandlers['chat-attachments-open-folder'](ipcEvent, {
      sessionId: 'session_1'
    })

    expect(result).toEqual({
      success: false,
      error: 'Could not open /project/attachments/chat-a3f21c: no file manager found'
    })
  })
})

describe('chat-attachments-add-from-picker', () => {
  it('copies the picked files into the chat folder', async () => {
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/tmp/a.txt'] })
    addAttachmentsFromPaths.mockResolvedValue({
      directory: '/project/attachments/chat-a3f21c',
      files: [],
      added: [],
      errors: []
    })

    const result = await chatAttachmentsHandlers['chat-attachments-add-from-picker'](ipcEvent, {
      sessionId: 'session_1'
    })

    expect(addAttachmentsFromPaths).toHaveBeenCalledWith('session_1', ['/tmp/a.txt'])
    expect(result.canceled).toBe(false)
  })

  it('reports a dismissed dialog without touching the folder', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    listAttachments.mockReturnValue({ directory: '', files: [] })

    const result = await chatAttachmentsHandlers['chat-attachments-add-from-picker'](ipcEvent, {
      sessionId: 'session_1'
    })

    expect(result.canceled).toBe(true)
    expect(addAttachmentsFromPaths).not.toHaveBeenCalled()
  })
})
