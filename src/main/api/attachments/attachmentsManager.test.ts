import fs from 'fs'
import os from 'os'
import path from 'path'

const storeValues: Record<string, string | undefined> = {}

jest.mock('../../../preload/store', () => ({
  store: { get: (key: string) => storeValues[key] }
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const manager = require('./attachmentsManager') as typeof import('./attachmentsManager')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { toShortId } =
  require('../../lib/chatFolderNaming') as typeof import('../../lib/chatFolderNaming')

const SESSION_ID = 'session_1756900000000'

let projectPath: string
let userDataPath: string

const setChatTitle = (sessionId: string, title: string): void => {
  const dir = path.join(userDataPath, 'chat-sessions')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, `${sessionId}.json`), JSON.stringify({ title }), 'utf-8')
}

const attachmentsRoot = (): string => path.join(projectPath, 'attachments')

const bytes = (content: string): Uint8Array => new Uint8Array(Buffer.from(content))

beforeEach(() => {
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'attachments-project-'))
  userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'attachments-userdata-'))
  storeValues.projectPath = projectPath
  storeValues.userDataPath = userDataPath
})

afterEach(() => {
  fs.rmSync(projectPath, { recursive: true, force: true })
  fs.rmSync(userDataPath, { recursive: true, force: true })
})

describe('folder naming and discovery', () => {
  it('names a folder after the chat title plus the chat short id', () => {
    setChatTitle(SESSION_ID, 'Fix the auth bug')

    expect(path.basename(manager.ensureAttachmentsDir(SESSION_ID))).toBe(
      `fix-the-auth-bug-${toShortId(SESSION_ID)}`
    )
  })

  it('falls back to the short id when the chat has no title yet', () => {
    expect(path.basename(manager.ensureAttachmentsDir(SESSION_ID))).toBe(
      `session-${toShortId(SESSION_ID)}`
    )
  })

  it('writes a self-ignoring .gitignore at the attachments root, once', () => {
    manager.ensureAttachmentsDir(SESSION_ID)
    const gitignore = path.join(attachmentsRoot(), '.gitignore')
    expect(fs.readFileSync(gitignore, 'utf-8')).toContain('*')

    fs.writeFileSync(gitignore, 'edited by hand', 'utf-8')
    manager.ensureAttachmentsDir(SESSION_ID)
    expect(fs.readFileSync(gitignore, 'utf-8')).toBe('edited by hand')
  })

  it('renames the folder to follow the title, keeping the files', async () => {
    setChatTitle(SESSION_ID, 'First title')
    await manager.addAttachments(SESSION_ID, [{ name: 'notes.txt', bytes: bytes('hello') }])

    setChatTitle(SESSION_ID, 'Second title')
    const result = manager.renameAttachmentsDir(SESSION_ID)

    expect(result.renamed).toBe(true)
    expect(path.basename(result.directory!)).toBe(`second-title-${toShortId(SESSION_ID)}`)
    expect(manager.listAttachments(SESSION_ID).files.map((file) => file.name)).toEqual([
      'notes.txt'
    ])
  })

  it('finds the folder again after a title change even with no explicit rename call', async () => {
    setChatTitle(SESSION_ID, 'Original')
    await manager.addAttachments(SESSION_ID, [{ name: 'a.txt', bytes: bytes('a') }])

    setChatTitle(SESSION_ID, 'Renamed while the app was closed')
    expect(manager.listAttachments(SESSION_ID).files.map((file) => file.name)).toEqual(['a.txt'])
  })

  it('leaves the folder alone when the target name is already taken', async () => {
    setChatTitle(SESSION_ID, 'Mine')
    await manager.addAttachments(SESSION_ID, [{ name: 'a.txt', bytes: bytes('a') }])

    setChatTitle(SESSION_ID, 'Taken')
    fs.mkdirSync(path.join(attachmentsRoot(), `taken-${toShortId(SESSION_ID)}`))

    const result = manager.renameAttachmentsDir(SESSION_ID)
    expect(result.renamed).toBe(false)
    expect(path.basename(result.directory!)).toBe(`mine-${toShortId(SESSION_ID)}`)
    expect(manager.listAttachments(SESSION_ID).files).toHaveLength(1)
  })

  it('keeps two chats with the same title in separate folders', async () => {
    const other = 'session_1756900000001'
    setChatTitle(SESSION_ID, 'Same title')
    setChatTitle(other, 'Same title')

    const first = manager.ensureAttachmentsDir(SESSION_ID)
    const second = manager.ensureAttachmentsDir(other)
    expect(first).not.toBe(second)
  })
})

describe('adding and listing', () => {
  it('classifies files by extension', async () => {
    await manager.addAttachments(SESSION_ID, [
      { name: 'notes.txt', bytes: bytes('text') },
      { name: 'sheet.xlsx', bytes: bytes('binary') },
      { name: 'shot.png', bytes: bytes('png') }
    ])

    const byName = Object.fromEntries(
      manager.listAttachments(SESSION_ID).files.map((file) => [file.name, file])
    )
    expect(byName['notes.txt'].kind).toBe('text')
    expect(byName['notes.txt'].extractable).toBe(true)
    // Nothing in the app parses spreadsheets, so they are attached but not inlined.
    expect(byName['sheet.xlsx'].kind).toBe('other')
    expect(byName['sheet.xlsx'].extractable).toBe(false)
    expect(byName['shot.png'].kind).toBe('image')
  })

  it('de-dups a repeated name instead of overwriting the first file', async () => {
    await manager.addAttachments(SESSION_ID, [{ name: 'a.txt', bytes: bytes('first') }])
    const second = await manager.addAttachments(SESSION_ID, [
      { name: 'a.txt', bytes: bytes('second') }
    ])

    expect(second.added[0].name).toBe('a-1.txt')
    expect(fs.readFileSync(path.join(second.directory, 'a.txt'), 'utf-8')).toBe('first')
  })

  it('reports a rejected file without failing the rest of the batch', async () => {
    const oversized = new Uint8Array(4 * 1024 * 1024)
    const result = await manager.addAttachments(SESSION_ID, [
      { name: 'big.png', bytes: oversized },
      { name: 'fine.txt', bytes: bytes('ok') }
    ])

    expect(result.added.map((file) => file.name)).toEqual(['fine.txt'])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0].name).toBe('big.png')
  })

  it('refuses a name that would escape the folder', async () => {
    const result = await manager.addAttachments(SESSION_ID, [
      { name: '../escaped.txt', bytes: bytes('nope') }
    ])

    // The name is reduced to its basename rather than reaching the parent directory.
    expect(result.added[0].name).toBe('escaped.txt')
    expect(fs.existsSync(path.join(attachmentsRoot(), 'escaped.txt'))).toBe(false)
  })

  it('has no files for a chat that never attached anything', () => {
    expect(manager.listAttachments(SESSION_ID).files).toEqual([])
  })
})

describe('removing', () => {
  it('hard-deletes one file', async () => {
    const added = await manager.addAttachments(SESSION_ID, [
      { name: 'a.txt', bytes: bytes('a') },
      { name: 'b.txt', bytes: bytes('b') }
    ])

    const result = await manager.removeAttachment(SESSION_ID, 'a.txt')
    expect(result.removed).toBe(true)
    expect(fs.existsSync(path.join(added.directory, 'a.txt'))).toBe(false)
    expect(result.files.map((file) => file.name)).toEqual(['b.txt'])
  })

  it('refuses a traversal attempt', async () => {
    await manager.addAttachments(SESSION_ID, [{ name: 'a.txt', bytes: bytes('a') }])
    const outside = path.join(projectPath, 'keep-me.txt')
    fs.writeFileSync(outside, 'keep', 'utf-8')

    await expect(manager.removeAttachment(SESSION_ID, '../../keep-me.txt')).rejects.toThrow()
    expect(fs.existsSync(outside)).toBe(true)
  })

  it('deletes the chat folder with its chat', async () => {
    const added = await manager.addAttachments(SESSION_ID, [{ name: 'a.txt', bytes: bytes('a') }])

    expect(manager.removeAllAttachments(SESSION_ID)).toEqual({ removed: true })
    expect(fs.existsSync(added.directory)).toBe(false)
    // A second call is a no-op rather than an error.
    expect(manager.removeAllAttachments(SESSION_ID)).toEqual({ removed: false })
  })

  it('clears every folder, including chats the sidebar would hide', async () => {
    await manager.addAttachments(SESSION_ID, [{ name: 'a.txt', bytes: bytes('a') }])
    await manager.addAttachments('session_1756900000002', [{ name: 'b.txt', bytes: bytes('b') }])

    expect(manager.removeEveryAttachmentsFolder()).toEqual({ removed: 2 })
    expect(fs.readdirSync(attachmentsRoot())).toEqual(['.gitignore'])
  })
})

describe('without a project directory', () => {
  it('reports no files instead of throwing', () => {
    storeValues.projectPath = undefined
    expect(manager.listAttachments(SESSION_ID)).toEqual({ directory: '', files: [] })
  })

  it('throws when asked to write, so the renderer can point at Settings', async () => {
    storeValues.projectPath = undefined
    await expect(
      manager.addAttachments(SESSION_ID, [{ name: 'a.txt', bytes: bytes('a') }])
    ).rejects.toThrow(/project directory/i)
  })
})
