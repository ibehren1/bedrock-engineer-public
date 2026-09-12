import fs from 'fs'
import os from 'os'
import path from 'path'
import yaml from 'js-yaml'
import { IpcMainInvokeEvent } from 'electron'
import { CustomAgent } from '../../types/agent-chat'

const showSaveDialog = jest.fn()
const showOpenDialog = jest.fn()
const showMessageBox = jest.fn()

jest.mock('electron', () => ({
  app: { getPath: () => '/downloads' },
  dialog: {
    showSaveDialog: (...args: unknown[]) => showSaveDialog(...args),
    showOpenDialog: (...args: unknown[]) => showOpenDialog(...args),
    showMessageBox: (...args: unknown[]) => showMessageBox(...args)
  },
  BrowserWindow: { fromWebContents: () => null }
}))

const storeValues: Record<string, unknown> = {}

jest.mock('../../preload/store', () => ({
  store: { get: (key: string) => storeValues[key] }
}))

// Keeps the AWS SDK and the Strands converter out of this suite; neither path is exercised here.
jest.mock('../api/bedrock/client', () => ({ createS3Client: jest.fn() }))
jest.mock('../services/strandsAgentsConverter', () => ({ StrandsAgentsConverter: jest.fn() }))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { agentHandlers } = require('./agent-handlers') as typeof import('./agent-handlers')

/** The handlers only use the event to resolve a parent window, which is mocked away. */
const event = { sender: {} } as unknown as IpcMainInvokeEvent

const AGENT: CustomAgent = {
  id: 'custom_agent_abc12345',
  name: 'Release Notes Writer',
  description: 'Turns a diff into release notes',
  system: 'You write release notes.',
  scenarios: [],
  tools: ['readFiles'],
  isCustom: true
}

let projectPath: string
let agentsDir: string

const writeSharedAgent = (fileName: string, agent: unknown): string => {
  const filePath = path.join(agentsDir, fileName)
  fs.writeFileSync(filePath, yaml.dump(agent), 'utf-8')
  return filePath
}

beforeEach(() => {
  showSaveDialog.mockReset()
  showOpenDialog.mockReset()
  showMessageBox.mockReset()

  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-handlers-'))
  agentsDir = path.join(projectPath, '.bedrock-engineer', 'agents')
  fs.mkdirSync(agentsDir, { recursive: true })
  storeValues.projectPath = projectPath
})

afterEach(() => {
  fs.rmSync(projectPath, { recursive: true, force: true })
})

describe('read-shared-agents', () => {
  it('reports the file each agent came from, so it can be downloaded or deleted', async () => {
    const filePath = writeSharedAgent('writer.yaml', AGENT)

    const { agents } = await agentHandlers['read-shared-agents'](event)

    expect(agents).toHaveLength(1)
    expect(agents[0].sharedFilePath).toBe(filePath)
    expect(agents[0].isShared).toBe(true)
  })
})

describe('save-shared-agent', () => {
  it('does not write sharedFilePath into the file it creates', async () => {
    const result = await agentHandlers['save-shared-agent'](event, {
      ...AGENT,
      sharedFilePath: '/somewhere/else/writer.yaml'
    })

    expect(result.success).toBe(true)
    const written = yaml.load(fs.readFileSync(result.filePath!, 'utf-8')) as CustomAgent
    expect(written.sharedFilePath).toBeUndefined()
  })
})

describe('export-agent-yaml', () => {
  it('writes YAML without the fields that describe this particular copy', async () => {
    const target = path.join(projectPath, 'exported.yaml')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })

    const result = await agentHandlers['export-agent-yaml'](event, {
      agent: {
        ...AGENT,
        isShared: true,
        directoryOnly: false,
        organizationId: 'org-1',
        sharedFilePath: '/project/.bedrock-engineer/agents/writer.yaml',
        mcpTools: [{ toolSpec: { name: 'whatever' } }]
      }
    })

    expect(result).toEqual({ success: true, filePath: target })
    const written = yaml.load(fs.readFileSync(target, 'utf-8')) as Record<string, unknown>
    expect(written).toEqual({
      name: AGENT.name,
      description: AGENT.description,
      system: AGENT.system,
      scenarios: [],
      tools: ['readFiles']
    })
  })

  it('reports cancellation rather than an error when the save dialog is dismissed', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })

    expect(await agentHandlers['export-agent-yaml'](event, { agent: AGENT })).toEqual({
      success: false,
      canceled: true
    })
  })

  it('offers the agent name as the filename, under the downloads folder', async () => {
    showSaveDialog.mockResolvedValue({ canceled: true })

    await agentHandlers['export-agent-yaml'](event, { agent: AGENT })

    expect(showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultPath: path.join('/downloads', 'release-notes-writer.yaml')
      })
    )
  })
})

describe('delete-shared-agent', () => {
  it('deletes the file once the user confirms', async () => {
    const filePath = writeSharedAgent('writer.yaml', AGENT)
    showMessageBox.mockResolvedValue({ response: 1 })

    const result = await agentHandlers['delete-shared-agent'](event, { filePath })

    expect(result).toEqual({ success: true, filePath })
    expect(fs.existsSync(filePath)).toBe(false)
  })

  it('leaves the file alone when the user cancels', async () => {
    const filePath = writeSharedAgent('writer.yaml', AGENT)
    showMessageBox.mockResolvedValue({ response: 0 })

    const result = await agentHandlers['delete-shared-agent'](event, { filePath })

    expect(result).toEqual({ success: false, canceled: true })
    expect(fs.existsSync(filePath)).toBe(true)
  })

  it('refuses a path outside the shared agents directory without prompting', async () => {
    const outside = path.join(projectPath, 'important.yaml')
    fs.writeFileSync(outside, 'keep me', 'utf-8')

    const result = await agentHandlers['delete-shared-agent'](event, { filePath: outside })

    expect(result.success).toBe(false)
    expect(showMessageBox).not.toHaveBeenCalled()
    expect(fs.existsSync(outside)).toBe(true)
  })

  it('refuses a path that escapes the shared agents directory with ..', async () => {
    const outside = path.join(projectPath, 'important.yaml')
    fs.writeFileSync(outside, 'keep me', 'utf-8')

    const result = await agentHandlers['delete-shared-agent'](event, {
      filePath: path.join(agentsDir, '..', '..', 'important.yaml')
    })

    expect(result.success).toBe(false)
    expect(fs.existsSync(outside)).toBe(true)
  })
})

describe('import-agent-file', () => {
  const pickFile = (fileName: string, content: string): string => {
    const filePath = path.join(projectPath, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] })
    return filePath
  }

  it('accepts a file produced by export-agent-yaml', async () => {
    const exported = path.join(projectPath, 'exported.yaml')
    showSaveDialog.mockResolvedValue({ canceled: false, filePath: exported })
    await agentHandlers['export-agent-yaml'](event, { agent: AGENT })
    showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [exported] })

    const result = await agentHandlers['import-agent-file'](event)

    expect(result.success).toBe(true)
    expect(result.agent!.name).toBe(AGENT.name)
    expect(result.agent!.system).toBe(AGENT.system)
    // The renderer assigns the real id; the file carries none
    expect(result.agent!.id).toBe('')
  })

  it('reads JSON as well as YAML', async () => {
    pickFile('agent.json', JSON.stringify(AGENT))

    const result = await agentHandlers['import-agent-file'](event)

    expect(result.success).toBe(true)
    expect(result.agent!.name).toBe(AGENT.name)
  })

  it('rejects a file missing the fields an agent cannot work without', async () => {
    pickFile('partial.yaml', yaml.dump({ name: 'Half An Agent', description: '' }))

    const result = await agentHandlers['import-agent-file'](event)

    expect(result.success).toBe(false)
    expect(result.error).toContain('description')
    expect(result.error).toContain('system')
    expect(result.agent).toBeUndefined()
  })

  it('rejects a file that does not contain an agent at all', async () => {
    pickFile('list.yaml', yaml.dump(['not', 'an', 'agent']))

    const result = await agentHandlers['import-agent-file'](event)

    expect(result.success).toBe(false)
    expect(result.error).toContain('does not contain an agent')
  })

  it('reports unparseable YAML with the file name', async () => {
    pickFile('broken.yaml', 'name: [unclosed\n')

    const result = await agentHandlers['import-agent-file'](event)

    expect(result.success).toBe(false)
    expect(result.error).toContain('broken.yaml')
  })

  it('reports cancellation rather than an error when the picker is dismissed', async () => {
    showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

    expect(await agentHandlers['import-agent-file'](event)).toEqual({
      success: false,
      canceled: true
    })
  })
})
