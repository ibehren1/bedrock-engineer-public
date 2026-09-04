import fs from 'fs'
import os from 'os'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'

const storeValues: Record<string, string | undefined> = {}

jest.mock('../../preload/store', () => ({
  store: { get: (key: string) => storeValues[key] }
}))

const GUIDE = '# Bedrock Engineer\n\nThe guide body.\n'

jest.mock('../lib/userGuide', () => ({
  USER_GUIDE_ATTACHMENT_NAME: 'BEDROCK_ENGINEER_USER_GUIDE.md',
  readUserGuide: jest.fn(async () => GUIDE)
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { helpHandlers } = require('./help-handlers') as typeof import('./help-handlers')

const SESSION_ID = 'session_1756900000000'
const event = undefined as unknown as IpcMainInvokeEvent

let projectPath: string | undefined
let userDataPath: string

const prepare = () => helpHandlers['help-prepare-user-guide'](event, { sessionId: SESSION_ID })

const attachedFiles = (): string[] => {
  const root = path.join(projectPath!, 'attachments')
  const chatFolder = fs.readdirSync(root).find((entry) => entry !== '.gitignore')
  return fs.readdirSync(path.join(root, chatFolder!))
}

beforeEach(() => {
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'help-project-'))
  userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'help-userdata-'))
  storeValues.projectPath = projectPath
  storeValues.userDataPath = userDataPath
})

afterEach(() => {
  if (projectPath) fs.rmSync(projectPath, { recursive: true, force: true })
  fs.rmSync(userDataPath, { recursive: true, force: true })
})

describe('help-prepare-user-guide', () => {
  it('attaches the guide to the chat folder', async () => {
    const result = await prepare()

    expect(result).toMatchObject({ attached: true, name: 'BEDROCK_ENGINEER_USER_GUIDE.md' })
    expect(result.attached && fs.readFileSync(result.path, 'utf-8')).toBe(GUIDE)
  })

  it('leaves exactly one copy behind when the chat is reopened', async () => {
    await prepare()
    await prepare()

    expect(attachedFiles()).toEqual(['BEDROCK_ENGINEER_USER_GUIDE.md'])
  })

  it('rewrites the attached copy when the shipped guide has changed', async () => {
    const first = await prepare()
    if (!first.attached) throw new Error('expected the guide to attach')
    fs.writeFileSync(first.path, 'stale, and a different length', 'utf-8')

    await prepare()

    expect(fs.readFileSync(first.path, 'utf-8')).toBe(GUIDE)
  })

  it('returns the guide text instead when no project directory is configured', async () => {
    storeValues.projectPath = undefined
    fs.rmSync(projectPath!, { recursive: true, force: true })
    projectPath = undefined

    const result = await prepare()

    expect(result.attached).toBe(false)
    expect(!result.attached && result.text).toBe(GUIDE)
    expect(!result.attached && result.reason).toContain('project directory')
  })
})
