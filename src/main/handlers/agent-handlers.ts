import {
  app,
  BrowserWindow,
  dialog,
  IpcMainInvokeEvent,
  MessageBoxOptions,
  OpenDialogOptions,
  SaveDialogOptions
} from 'electron'
import { basename, dirname, join, resolve } from 'path'
import fs from 'fs'
import yaml from 'js-yaml'
import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { CustomAgent } from '../../types/agent-chat'
import { createCategoryLogger } from '../../common/logger'
import { store } from '../../preload/store'
import { StrandsAgentsConverter } from '../services/strandsAgentsConverter'
import { createS3Client } from '../api/bedrock/client'
import { validateCustomAgent } from '../../common/validation/agent-validator'

const agentsLogger = createCategoryLogger('agents:ipc')

/** Agent config file formats accepted when reading or importing. */
const AGENT_FILE_EXTENSIONS = ['yaml', 'yml', 'json']

/**
 * Fields that describe *this copy* of an agent rather than the agent itself: which list it came
 * from, what id it was given locally, and the MCP tools discovered at runtime. They are stripped
 * before an agent is written to a file so the file stays portable.
 */
const INSTANCE_ONLY_AGENT_FIELDS = [
  'id',
  'isShared',
  'isCustom',
  'directoryOnly',
  'organizationId',
  'sharedFilePath',
  'mcpTools'
] as const

/** Turn an agent name into a filename stem. Matches the naming used for shared agent files. */
function toAgentFileSlug(name: unknown): string {
  return (
    String(name ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'custom-agent'
  )
}

/** The directory shared agents live in, or null when no project folder is selected. */
function getSharedAgentsDir(): string | null {
  const projectPath = store.get('projectPath') as string
  return projectPath ? resolve(projectPath, '.bedrock-engineer/agents') : null
}

/**
 * Dialogs are opened attached to the window that asked for them, so they behave as sheets on macOS
 * and cannot be lost behind the app. `BrowserWindow.fromWebContents` can return null (the window is
 * closing), in which case an app-modal dialog is still better than none — hence the paired calls.
 */
function showAgentSaveDialog(event: IpcMainInvokeEvent, options: SaveDialogOptions) {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? dialog.showSaveDialog(window, options) : dialog.showSaveDialog(options)
}

function showAgentOpenDialog(event: IpcMainInvokeEvent, options: OpenDialogOptions) {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options)
}

function showAgentMessageBox(event: IpcMainInvokeEvent, options: MessageBoxOptions) {
  const window = BrowserWindow.fromWebContents(event.sender)
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options)
}

/** Parse an agent config file. YAML covers both formats, but JSON gets the better error message. */
function parseAgentFile(content: string, filePath: string): unknown {
  return filePath.endsWith('.json') ? JSON.parse(content) : yaml.load(content)
}

/**
 * Load shared agents from the project directory
 * This function reads agent JSON and YAML files from the .bedrock-engineer/agents directory
 * Always reads from disk to ensure latest data is returned
 */
async function loadSharedAgents(): Promise<{ agents: CustomAgent[]; error: string | null }> {
  try {
    const projectPath = store.get('projectPath') as string
    if (!projectPath) {
      return { agents: [], error: null }
    }

    agentsLogger.debug('Loading shared agents from disk', { projectPath })
    const agentsDir = resolve(projectPath, '.bedrock-engineer/agents')

    // Check if the directory exists
    try {
      await fs.promises.access(agentsDir)
    } catch (error) {
      // If directory doesn't exist, just return empty array
      return { agents: [], error: null }
    }

    // Read JSON and YAML files in the agents directory
    const files = (await fs.promises.readdir(agentsDir)).filter(
      (file) => file.endsWith('.json') || file.endsWith('.yml') || file.endsWith('.yaml')
    )
    const agents: CustomAgent[] = []

    // Process all files concurrently using Promise.all for better performance
    const agentPromises = files.map(async (file) => {
      try {
        const filePath = resolve(agentsDir, file)
        const content = await fs.promises.readFile(filePath, 'utf-8')

        // Parse the file content based on its extension
        let agent: CustomAgent
        if (file.endsWith('.json')) {
          agent = JSON.parse(content) as CustomAgent
        } else if (file.endsWith('.yml') || file.endsWith('.yaml')) {
          agent = yaml.load(content) as CustomAgent
        } else {
          throw new Error(`Unsupported file format: ${file}`)
        }

        // Make sure each loaded agent has a unique ID to prevent React key conflicts
        // If the ID doesn't already start with 'shared-', prefix it
        if (!agent.id || !agent.id.startsWith('shared-')) {
          // Remove any file extension (.json, .yml, .yaml) for the safeName
          const safeName = file.replace(/\.(json|ya?ml)$/, '').toLowerCase()
          agent.id = `shared-${safeName}-${Math.random().toString(36).substring(2, 9)}`
        }

        // Add a flag to indicate this is a shared agent
        agent.isShared = true

        // Remember where this copy came from so the UI can offer to download or delete the file
        agent.sharedFilePath = filePath

        // mcpToolsは自動的に生成されるため、保存対象から除外（後でpreloadで復元される）
        // ここではmcpToolsを削除することでファイルからの読み込み時にも整合性を保つ
        delete agent.mcpTools

        // Validate agent with warning-only mode
        const validationResult = validateCustomAgent(agent, {
          source: 'shared-agents',
          filePath: file
        })

        return validationResult.data
      } catch (err) {
        agentsLogger.error(`Error reading agent file`, {
          file,
          error: err instanceof Error ? err.message : String(err)
        })
        return null
      }
    })

    // Wait for all promises to resolve and filter out any null results (from failed reads)
    const loadedAgents = (await Promise.all(agentPromises)).filter(
      (agent): agent is CustomAgent => agent !== null
    )
    agents.push(...loadedAgents)

    return { agents, error: null }
  } catch (error) {
    console.error('Error reading shared agents:', error)
    return { agents: [], error: error instanceof Error ? error.message : String(error) }
  }
}

export const agentHandlers = {
  'read-shared-agents': async (_event: IpcMainInvokeEvent) => {
    return await loadSharedAgents()
  },

  'save-shared-agent': async (
    _event: IpcMainInvokeEvent,
    agent: any,
    options?: { format?: 'json' | 'yaml' }
  ) => {
    try {
      const projectPath = store.get('projectPath') as string
      if (!projectPath) {
        return { success: false, error: 'No project path selected' }
      }

      // Determine file format (default to YAML if not specified)
      const format = options?.format || 'yaml'
      const fileExtension = format === 'json' ? '.json' : '.yaml'

      // Ensure directories exist
      const bedrockEngineerDir = resolve(projectPath, '.bedrock-engineer')
      const agentsDir = resolve(bedrockEngineerDir, 'agents')

      // Create directories if they don't exist (recursive will create both parent and child dirs)
      await fs.promises.mkdir(agentsDir, { recursive: true })

      // Generate a safe filename from the agent name
      const safeFileName =
        agent.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || 'custom-agent'

      // Check if the file already exists and add a suffix if needed
      let fileName = `${safeFileName}${fileExtension}`
      let count = 1

      // Helper function to check if file exists, using async fs
      const fileExists = async (path: string): Promise<boolean> => {
        try {
          await fs.promises.access(path)
          return true
        } catch {
          return false
        }
      }

      while (await fileExists(resolve(agentsDir, fileName))) {
        fileName = `${safeFileName}-${count}${fileExtension}`
        count++
      }

      // Generate new ID for shared agent to avoid key conflicts
      const newId = `shared-${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`

      // Make sure agent has isShared set to true and a unique ID
      const sharedAgent = {
        ...agent,
        id: newId,
        isShared: true
      }

      // mcpToolsは保存対象から除外（mcpServersのみを保存）
      delete sharedAgent.mcpTools

      // sharedFilePath describes where a copy was loaded from, so it must never be written out
      delete sharedAgent.sharedFilePath

      // Write the agent to file based on the format
      const filePath = resolve(agentsDir, fileName)
      let fileContent: string

      if (format === 'json') {
        fileContent = JSON.stringify(sharedAgent, null, 2)
      } else {
        // For YAML format
        fileContent = yaml.dump(sharedAgent, {
          indent: 2,
          lineWidth: 120,
          noRefs: true, // Don't output YAML references
          sortKeys: false // Preserve key order
        })
      }

      await fs.promises.writeFile(filePath, fileContent, 'utf-8')

      return { success: true, filePath, format }
    } catch (error) {
      console.error('Error saving shared agent:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },

  // Delete the shared copy of an agent, i.e. its file under .bedrock-engineer/agents.
  //
  // The user's own agent in `customAgents` is a separate record and is left alone; this only
  // un-shares. The path comes from the renderer, so it is checked against the shared agents
  // directory before anything is unlinked, and the user confirms against the real path.
  'delete-shared-agent': async (event: IpcMainInvokeEvent, params: { filePath: string }) => {
    try {
      const agentsDir = getSharedAgentsDir()
      if (!agentsDir) {
        return { success: false, error: 'No project path selected' }
      }

      // The path arrives from the renderer, so it is only trusted once it resolves to a file sitting
      // directly in this project's shared agents directory.
      const filePath = resolve(params.filePath)
      if (dirname(filePath) !== agentsDir) {
        agentsLogger.warn('Refused to delete a file outside the shared agents directory', {
          filePath,
          agentsDir
        })
        return { success: false, error: 'That file is not a shared agent of this project' }
      }

      try {
        await fs.promises.access(filePath)
      } catch {
        return { success: false, error: `File no longer exists: ${filePath}` }
      }

      const { response } = await showAgentMessageBox(event, {
        type: 'warning',
        buttons: ['Cancel', 'Delete'],
        defaultId: 0,
        cancelId: 0,
        message: `Delete the shared agent file "${basename(filePath)}"?`,
        detail: `${filePath}\n\nThe agent stops appearing for anyone who opens this project. Your own copy of the agent is not affected.`
      })

      if (response !== 1) {
        return { success: false, canceled: true }
      }

      await fs.promises.unlink(filePath)
      agentsLogger.info('Deleted shared agent file', { filePath })

      return { success: true, filePath }
    } catch (error) {
      agentsLogger.error('Error deleting shared agent file', {
        filePath: params?.filePath,
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },

  // Write an agent to a YAML file the user picks, so it can be sent to someone else or kept
  // outside the app. Instance-only fields are stripped so the file imports cleanly anywhere.
  'export-agent-yaml': async (event: IpcMainInvokeEvent, params: { agent: any }) => {
    try {
      const agent = params?.agent
      if (!agent?.name) {
        return { success: false, error: 'No agent to export' }
      }

      const { canceled, filePath } = await showAgentSaveDialog(event, {
        title: 'Download agent YAML',
        defaultPath: join(app.getPath('downloads'), `${toAgentFileSlug(agent.name)}.yaml`),
        filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }]
      })

      if (canceled || !filePath) {
        return { success: false, canceled: true }
      }

      const portableAgent = { ...agent }
      for (const field of INSTANCE_ONLY_AGENT_FIELDS) {
        delete portableAgent[field]
      }

      const fileContent = yaml.dump(portableAgent, {
        indent: 2,
        lineWidth: 120,
        noRefs: true,
        sortKeys: false
      })

      await fs.promises.writeFile(filePath, fileContent, 'utf-8')
      agentsLogger.info('Exported agent YAML', { agentName: agent.name, filePath })

      return { success: true, filePath }
    } catch (error) {
      agentsLogger.error('Error exporting agent YAML', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },

  // Read an agent config file the user picks, for the renderer to add as its own custom agent.
  //
  // Unlike the shared/organization loaders this validates fail-closed: a file the user just chose
  // deserves an error message rather than a half-broken agent in their list. The full schema is too
  // strict for the job, though — exported files carry no `id` and may carry no `scenarios` — so the
  // schema check stays a warning and only the fields an agent cannot work without are enforced.
  'import-agent-file': async (event: IpcMainInvokeEvent) => {
    try {
      const { canceled, filePaths } = await showAgentOpenDialog(event, {
        title: 'Import agent',
        properties: ['openFile'],
        filters: [{ name: 'Agent', extensions: AGENT_FILE_EXTENSIONS }]
      })

      if (canceled || filePaths.length === 0) {
        return { success: false, canceled: true }
      }

      const filePath = filePaths[0]
      const content = await fs.promises.readFile(filePath, 'utf-8')

      let parsed: unknown
      try {
        parsed = parseAgentFile(content, filePath)
      } catch (error) {
        return {
          success: false,
          error: `${basename(filePath)} is not valid ${filePath.endsWith('.json') ? 'JSON' : 'YAML'}: ${
            error instanceof Error ? error.message : String(error)
          }`
        }
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { success: false, error: `${basename(filePath)} does not contain an agent` }
      }

      const agent = { ...(parsed as Record<string, any>) } as CustomAgent
      agent.id = agent.id ?? ''
      agent.scenarios = agent.scenarios ?? []
      delete agent.mcpTools

      validateCustomAgent(agent, { source: 'import-agent', filePath })

      const missing = (['name', 'description', 'system'] as const).filter((field) => {
        const value = agent[field]
        return typeof value !== 'string' || value.trim() === ''
      })
      if (missing.length > 0) {
        return {
          success: false,
          error: `${basename(filePath)} is missing required agent ${
            missing.length === 1 ? 'field' : 'fields'
          }: ${missing.join(', ')}`
        }
      }

      agentsLogger.info('Imported agent file', { agentName: agent.name, filePath })

      return { success: true, agent, filePath }
    } catch (error) {
      agentsLogger.error('Error importing agent file', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  },

  'load-organization-agents': async (_event: IpcMainInvokeEvent, organizationConfig: any) => {
    try {
      agentsLogger.info('Loading organization agents from S3', {
        bucket: organizationConfig.s3Config.bucket,
        prefix: organizationConfig.s3Config.prefix,
        region: organizationConfig.s3Config.region
      })

      // AWS認証情報を取得し、組織設定のリージョンを適用
      const awsCredentials = store.get('aws') as any
      if (!awsCredentials) {
        return { agents: [], error: 'AWS credentials not configured' }
      }

      // AWS SDK を使用してS3からエージェントファイルを取得
      const s3Client = createS3Client({
        ...awsCredentials,
        region: organizationConfig.s3Config.region
      })

      // S3からオブジェクト一覧を取得
      const listCommand = new ListObjectsV2Command({
        Bucket: organizationConfig.s3Config.bucket,
        Prefix: organizationConfig.s3Config.prefix || ''
      })

      const listResponse = await s3Client.send(listCommand)
      const objects = listResponse.Contents || []

      // YAML/JSONファイルのみをフィルタリング
      const agentFiles = objects.filter(
        (obj: any) =>
          obj.Key &&
          (obj.Key.endsWith('.yaml') || obj.Key.endsWith('.yml') || obj.Key.endsWith('.json'))
      )

      const agents: CustomAgent[] = []

      // 各ファイルを並行して処理
      const agentPromises = agentFiles.map(async (file: any) => {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: organizationConfig.s3Config.bucket,
            Key: file.Key
          })

          const response = await s3Client.send(getCommand)
          const content = await response.Body?.transformToString('utf-8')

          if (!content) {
            agentsLogger.warn('Empty file content', { key: file.Key })
            return null
          }

          // ファイル形式に応じて解析
          let agent: CustomAgent
          if (file.Key.endsWith('.json')) {
            agent = JSON.parse(content) as CustomAgent
          } else {
            agent = yaml.load(content) as CustomAgent
          }

          // 組織エージェントとしてマーク
          const orgId = `org-${organizationConfig.id}-${file.Key.replace(/\.(json|ya?ml)$/, '').toLowerCase()}-${Math.random().toString(36).substring(2, 9)}`
          agent.id = orgId
          agent.isShared = false
          agent.isCustom = false
          agent.directoryOnly = false
          agent.organizationId = organizationConfig.id

          // mcpToolsは自動的に生成されるため削除
          delete agent.mcpTools

          // Validate agent with warning-only mode
          const validationResult = validateCustomAgent(agent, {
            source: 'organization-agents',
            filePath: file.Key
          })

          return validationResult.data
        } catch (err) {
          agentsLogger.error('Error reading organization agent file', {
            key: file.Key,
            error: err instanceof Error ? err.message : String(err)
          })
          return null
        }
      })

      const loadedAgents = (await Promise.all(agentPromises)).filter(
        (agent): agent is CustomAgent => agent !== null
      )
      agents.push(...loadedAgents)

      return { agents, error: null }
    } catch (error) {
      agentsLogger.error('Error loading organization agents', {
        error: error instanceof Error ? error.message : String(error)
      })
      return { agents: [], error: error instanceof Error ? error.message : String(error) }
    }
  },

  'save-agent-to-organization': async (
    _event: IpcMainInvokeEvent,
    agent: any,
    organizationConfig: any,
    options?: { format?: 'json' | 'yaml' }
  ) => {
    try {
      agentsLogger.info('Saving agent to organization S3', {
        agentName: agent.name,
        bucket: organizationConfig.s3Config.bucket,
        prefix: organizationConfig.s3Config.prefix
      })

      // ファイル形式を決定（デフォルトはYAML）
      const format = options?.format || 'yaml'
      const fileExtension = format === 'json' ? '.json' : '.yaml'

      // 安全なファイル名を生成
      const safeFileName =
        agent.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '') || 'custom-agent'

      // S3キーを構築
      const prefix = organizationConfig.s3Config.prefix || ''
      const s3Key = prefix
        ? `${prefix}/${safeFileName}${fileExtension}`
        : `${safeFileName}${fileExtension}`

      // 組織共有エージェント用の新しいIDを生成
      const newId = `shared-${agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}`

      // 保存用エージェント設定を準備
      const sharedAgent = {
        ...agent,
        id: newId,
        isShared: true,
        organizationId: organizationConfig.id
      }

      // mcpToolsは保存対象から除外
      delete sharedAgent.mcpTools
      delete sharedAgent.sharedFilePath

      // コンテンツを生成
      let fileContent: string
      if (format === 'json') {
        fileContent = JSON.stringify(sharedAgent, null, 2)
      } else {
        fileContent = yaml.dump(sharedAgent, {
          indent: 2,
          lineWidth: 120,
          noRefs: true,
          sortKeys: false
        })
      }

      // AWS認証情報を取得し、組織設定のリージョンを適用
      const awsCredentials = store.get('aws') as any
      if (!awsCredentials) {
        return { success: false, error: 'AWS credentials not configured' }
      }

      // AWS SDK を使用してS3にアップロード
      const s3Client = createS3Client({
        ...awsCredentials,
        region: organizationConfig.s3Config.region
      })

      const putCommand = new PutObjectCommand({
        Bucket: organizationConfig.s3Config.bucket,
        Key: s3Key,
        Body: fileContent,
        ContentType: format === 'json' ? 'application/json' : 'application/x-yaml'
      })

      await s3Client.send(putCommand)

      return { success: true, s3Key, format }
    } catch (error) {
      agentsLogger.error('Error saving agent to organization', {
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },

  'convert-agent-to-strands': async (
    _event: IpcMainInvokeEvent,
    agentId: string,
    outputDirectory: string
  ) => {
    try {
      agentsLogger.info('Converting agent to Strands Agents', { agentId, outputDirectory })

      // First, try to find the agent in shared agents
      const { agents: sharedAgents } = await loadSharedAgents()
      let agent = sharedAgents.find((a) => a.id === agentId)

      // If not found in shared agents, try to get it from user settings
      if (!agent) {
        const userAgents = store.get('customAgents') || []
        agent = userAgents.find((a) => a.id === agentId)
      }

      if (!agent) {
        return {
          success: false,
          error: `Agent with ID ${agentId} not found`
        }
      }

      // Initialize converter and convert agent
      const converter = new StrandsAgentsConverter()
      const saveOptions = {
        outputDirectory,
        includeConfig: false,
        overwrite: true
      }

      const result = await converter.convertAndSaveAgent(agent, saveOptions)

      agentsLogger.info('Strands Agents conversion completed', {
        success: result.success,
        savedFiles: result.savedFiles.length
      })

      return result
    } catch (error) {
      agentsLogger.error('Error converting agent to Strands Agents', {
        agentId,
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        outputDirectory,
        savedFiles: [],
        errors: [
          {
            file: 'conversion',
            error: error instanceof Error ? error.message : String(error)
          }
        ]
      }
    }
  }
} as const
