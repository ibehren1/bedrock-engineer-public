import fs from 'fs'
import path from 'path'
import { createCategoryLogger } from '../../../common/logger'
import { store } from '../../../preload/store'
import { assertSandboxUsable, checkDockerAvailability } from './dockerAvailability'
import {
  containerNameFor as buildContainerName,
  isDefaultChatTitle,
  toFolderName,
  toProjectName
} from './naming'
import { assertPortsAvailable, buildCompose, writeSandboxFiles } from './composeWriter'
import { compose, ComposeContext, listProjectContainers, run } from './composeRunner'
import {
  execInSandbox,
  ExecTarget,
  invalidateSessionExecs,
  isSandboxPid,
  readSandboxLogs,
  sendInputToSandbox
} from './sandboxExec'
import {
  CreateSandboxOptions,
  DEFAULT_SANDBOX_CONFIG,
  DEFAULT_SANDBOX_IMAGE,
  DockerAvailability,
  DockerSandboxConfig,
  SANDBOX_ROOT_DIRNAME,
  SandboxExecOptions,
  SandboxExecResult,
  SandboxMetadata,
  SandboxRemoveOptions,
  SandboxRunState,
  SandboxStatus,
  WORKSPACE_MOUNT
} from './types'

const logger = createCategoryLogger('docker:sandbox')

const METADATA_FILENAME = 'sandbox.json'

/** Cached availability probe. Docker state changes rarely; re-probe at most this often. */
let availabilityCache: { value: DockerAvailability; at: number } | null = null
const AVAILABILITY_TTL_MS = 15_000

export const getAvailability = async (force = false): Promise<DockerAvailability> => {
  if (!force && availabilityCache && Date.now() - availabilityCache.at < AVAILABILITY_TTL_MS) {
    return availabilityCache.value
  }
  const value = await checkDockerAvailability()
  availabilityCache = { value, at: Date.now() }
  return value
}

const getProjectPath = (): string => {
  const configured = store.get('projectPath') as string | undefined
  if (!configured) {
    throw new Error(
      'No project directory is configured. Set one in Settings before using the Docker sandbox.'
    )
  }
  return configured
}

export const getSandboxRoot = (projectPath = getProjectPath()): string =>
  path.join(projectPath, SANDBOX_ROOT_DIRNAME)

/**
 * Read a chat's current title straight from the session file the chat history writes.
 *
 * Sandboxes are created lazily during a tool call, with no renderer involved, so the
 * title has to be resolvable from the main process.
 */
const readChatTitle = (sessionId: string): string | undefined => {
  try {
    const userDataPath = store.get('userDataPath') as string | undefined
    if (!userDataPath) return undefined

    const file = path.join(userDataPath, 'chat-sessions', `${sessionId}.json`)
    if (!fs.existsSync(file)) return undefined

    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as { title?: string }
    return typeof parsed.title === 'string' ? parsed.title : undefined
  } catch (error) {
    logger.debug('Could not read chat title for sandbox naming', {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    })
    return undefined
  }
}

/**
 * Locate an existing sandbox folder by scanning for the metadata file that claims this
 * session. Folders are named after the chat title and get renamed when the title changes,
 * so the name cannot be derived from the session id alone.
 */
const findSandboxDir = (sessionId: string): string | undefined => {
  try {
    const root = getSandboxRoot()
    if (!fs.existsSync(root)) return undefined

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue

      const candidate = path.join(root, entry.name, METADATA_FILENAME)
      if (!fs.existsSync(candidate)) continue

      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as SandboxMetadata
      if (parsed.sessionId === sessionId) return path.join(root, entry.name)
    }
  } catch (error) {
    logger.warn('Failed to locate sandbox directory', {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    })
  }
  return undefined
}

/**
 * Directory for a session's sandbox: the existing one if there is one, otherwise the
 * readable name its current chat title implies.
 */
export const getSandboxDir = (sessionId: string, projectPath = getProjectPath()): string => {
  const existing = findSandboxDir(sessionId)
  if (existing) return existing

  return path.join(getSandboxRoot(projectPath), toFolderName(sessionId, readChatTitle(sessionId)))
}

const getConfig = (): DockerSandboxConfig => {
  const stored = store.get('dockerSandboxTool') as DockerSandboxConfig | undefined
  return { ...DEFAULT_SANDBOX_CONFIG, ...(stored ?? {}) }
}

/**
 * Keep generated sandboxes out of the user's repository. Written once, at the root of
 * docker-sandboxes/, because the folder lives inside projectPath.
 */
const ensureSandboxRoot = (projectPath: string): string => {
  const root = getSandboxRoot(projectPath)
  fs.mkdirSync(root, { recursive: true })

  const gitignore = path.join(root, '.gitignore')
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(
      gitignore,
      '# Chat-scoped Docker sandboxes generated by Bedrock Engineer.\n*\n',
      'utf-8'
    )
  }
  return root
}

const readMetadata = (sessionId: string): SandboxMetadata | undefined => {
  try {
    const dir = findSandboxDir(sessionId)
    if (!dir) return undefined

    const file = path.join(dir, METADATA_FILENAME)
    if (!fs.existsSync(file)) return undefined

    const metadata = JSON.parse(fs.readFileSync(file, 'utf-8')) as SandboxMetadata

    // The folder may have been renamed since it was written; trust its location on disk
    // over the paths recorded inside it.
    return {
      ...metadata,
      directory: dir,
      composeFile: path.join(dir, path.basename(metadata.composeFile))
    }
  } catch (error) {
    logger.warn('Failed to read sandbox metadata', {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    })
    return undefined
  }
}

const writeMetadata = (metadata: SandboxMetadata): void => {
  fs.writeFileSync(
    path.join(metadata.directory, METADATA_FILENAME),
    JSON.stringify(metadata, null, 2),
    'utf-8'
  )
}

const toComposeContext = (
  metadata: SandboxMetadata,
  availability: DockerAvailability
): ComposeContext | null => {
  if (metadata.composeless || availability.compose === 'none') return null
  return {
    flavor: availability.compose,
    composeFile: metadata.composeFile,
    envFile: path.join(metadata.directory, '.env'),
    cwd: metadata.directory
  }
}

const containerNameFor = (metadata: SandboxMetadata, service: string): string =>
  buildContainerName(metadata.projectName, service)

const toExecTarget = async (metadata: SandboxMetadata, service?: string): Promise<ExecTarget> => {
  const availability = await getAvailability()
  const resolvedService = service ?? metadata.services[0]?.name

  if (!resolvedService) {
    throw new Error(`Sandbox for session ${metadata.sessionId} has no services.`)
  }
  if (!metadata.services.some((s) => s.name === resolvedService)) {
    throw new Error(
      `Service "${resolvedService}" is not part of this sandbox. Available services: ${metadata.services
        .map((s) => s.name)
        .join(', ')}.`
    )
  }

  return {
    sessionId: metadata.sessionId,
    service: resolvedService,
    compose: toComposeContext(metadata, availability),
    containerName: containerNameFor(metadata, resolvedService)
  }
}

const deriveState = (
  metadata: SandboxMetadata | undefined,
  containers: { state: string }[]
): SandboxRunState => {
  if (!metadata) return 'missing'
  if (containers.length === 0) return 'stopped'

  const running = containers.filter((c) => c.state === 'running').length
  if (running === 0) return 'stopped'
  return running === containers.length ? 'running' : 'partial'
}

/**
 * Start a composeless sandbox: one `docker run -d` per service. Only reached when no
 * compose implementation is installed.
 */
const runComposeless = async (
  metadata: SandboxMetadata,
  config: DockerSandboxConfig
): Promise<void> => {
  if (metadata.services.length > 1) {
    throw new Error(
      'This sandbox defines multiple services, which requires Docker Compose. Install the compose plugin (`docker compose`) and recreate the sandbox, or define a single service.'
    )
  }

  const service = metadata.services[0]
  const name = containerNameFor(metadata, service.name)

  // Remove a stale container with the same name so re-creation is idempotent.
  await run('docker', ['rm', '-f', name])

  const args = [
    'run',
    '-d',
    '--name',
    name,
    '--label',
    `com.docker.compose.project=${metadata.projectName}`,
    '--label',
    `com.docker.compose.service=${service.name}`,
    '--workdir',
    WORKSPACE_MOUNT,
    '-v',
    `${metadata.projectPath}:${WORKSPACE_MOUNT}`,
    '-v',
    `${path.join(metadata.directory, 'data', service.name)}:/data`,
    '--memory',
    config.memoryLimit,
    '--cpus',
    String(config.cpuLimit),
    '-e',
    'DEBIAN_FRONTEND=noninteractive'
  ]

  for (const port of service.ports) {
    args.push('-p', `${port.host}:${port.container}`)
  }

  args.push(service.image, 'sleep', 'infinity')

  const result = await run('docker', args, { timeoutMs: 180_000 })
  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to start sandbox container: ${result.stderr.trim() || result.stdout.trim()}`
    )
  }
}

const upSandbox = async (metadata: SandboxMetadata): Promise<void> => {
  const availability = await getAvailability()
  assertSandboxUsable(availability)

  const ctx = toComposeContext(metadata, availability)

  if (!ctx) {
    await runComposeless(metadata, getConfig())
    return
  }

  // Pulling can be slow on a cold cache, so this gets a longer budget than other calls.
  const result = await compose(ctx, ['up', '-d', '--remove-orphans'], { timeoutMs: 600_000 })
  if (result.exitCode !== 0) {
    throw new Error(
      `docker compose up failed: ${result.stderr.trim() || result.stdout.trim() || 'unknown error'}`
    )
  }
}

/**
 * Create (or recreate) the sandbox for a chat session and bring it up.
 */
export const createSandbox = async (
  sessionId: string,
  options: CreateSandboxOptions = {}
): Promise<{ metadata: SandboxMetadata; warnings: string[] }> => {
  const availability = await getAvailability(true)
  assertSandboxUsable(availability)

  const projectPath = getProjectPath()
  ensureSandboxRoot(projectPath)

  const sandboxDir = getSandboxDir(sessionId, projectPath)
  const projectName = toProjectName(sessionId)
  const config = getConfig()

  const existing = readMetadata(sessionId)
  if (existing && !options.recreate && !options.composeYaml && !options.services) {
    await upSandbox(existing)
    return { metadata: existing, warnings: [] }
  }

  if (existing && options.recreate) {
    await removeSandbox(sessionId, { deleteData: false })
  }

  const built = buildCompose(options, sandboxDir, projectPath, config)
  await assertPortsAvailable(built.services)

  const { composeFile } = writeSandboxFiles({
    sandboxDir,
    projectName,
    projectPath,
    built,
    env: options.env
  })

  const now = new Date().toISOString()
  const metadata: SandboxMetadata = {
    sessionId,
    projectName,
    directory: sandboxDir,
    composeFile,
    projectPath,
    services: built.services.map((s) => ({
      name: s.name,
      image: s.image || DEFAULT_SANDBOX_IMAGE,
      ports: s.ports
    })),
    composeless: availability.compose === 'none',
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }

  writeMetadata(metadata)
  await upSandbox(metadata)

  logger.info('Sandbox created', {
    sessionId,
    projectName,
    services: metadata.services.map((s) => s.name),
    composeless: metadata.composeless
  })

  return { metadata, warnings: built.warnings }
}

/**
 * Move a sandbox's folder to match the chat's current title.
 *
 * Only the folder moves. The compose project name stays keyed on the session id, so
 * compose keeps finding the containers by label and nothing has to be recreated —
 * installed packages survive a rename. Bind mounts survive too: `rename` keeps the same
 * inode, so a running container's /data still resolves to the moved directory.
 */
export const renameSandbox = async (
  sessionId: string
): Promise<{ renamed: boolean; directory?: string }> => {
  const metadata = readMetadata(sessionId)
  if (!metadata) return { renamed: false }

  // The chat session file is the single source of truth for the title. Taking a caller's
  // title instead would let an explicit rename disagree with it, and the opportunistic
  // follow in ensureSandbox would then quietly undo the rename on the next command.
  const resolvedTitle = readChatTitle(sessionId)
  const desired = path.join(
    getSandboxRoot(metadata.projectPath),
    toFolderName(sessionId, resolvedTitle)
  )

  if (path.resolve(desired) === path.resolve(metadata.directory)) {
    return { renamed: false, directory: metadata.directory }
  }

  // A name collision means a different chat already owns that folder. Leave the sandbox
  // where it is rather than clobbering someone else's data.
  if (fs.existsSync(desired)) {
    logger.warn('Skipping sandbox rename because the target folder already exists', {
      sessionId,
      desired
    })
    return { renamed: false, directory: metadata.directory }
  }

  try {
    fs.renameSync(metadata.directory, desired)
  } catch (error) {
    logger.warn('Failed to rename sandbox folder', {
      sessionId,
      from: metadata.directory,
      to: desired,
      error: error instanceof Error ? error.message : String(error)
    })
    return { renamed: false, directory: metadata.directory }
  }

  writeMetadata({
    ...metadata,
    directory: desired,
    composeFile: path.join(desired, path.basename(metadata.composeFile)),
    updatedAt: new Date().toISOString()
  })

  logger.info('Sandbox folder renamed to follow the chat title', {
    sessionId,
    from: path.basename(metadata.directory),
    to: path.basename(desired)
  })

  return { renamed: true, directory: desired }
}

/**
 * Return the sandbox for a session, creating a default one on first use.
 */
export const ensureSandbox = async (sessionId: string): Promise<SandboxMetadata> => {
  let existing = readMetadata(sessionId)

  if (!existing) {
    const { metadata } = await createSandbox(sessionId)
    return metadata
  }

  // Sandboxes are usually created before the chat has a real title, and folders created by
  // earlier versions are named after the raw session id. Catch both up here, so a sandbox
  // becomes readable even if the rename hook never fired.
  if (!isDefaultChatTitle(readChatTitle(sessionId))) {
    const { renamed } = await renameSandbox(sessionId)
    if (renamed) existing = readMetadata(sessionId) ?? existing
  }

  const status = await getStatus(sessionId)
  if (status.state !== 'running') {
    await upSandbox(existing)
  }
  return existing
}

export const getStatus = async (sessionId: string): Promise<SandboxStatus> => {
  const metadata = readMetadata(sessionId)

  if (!metadata) {
    return { exists: false, state: 'missing', containers: [] }
  }

  const availability = await getAvailability()
  if (!availability.dockerInstalled || !availability.daemonRunning) {
    // The sandbox's files exist even when Docker can't answer for its containers.
    return { exists: true, state: 'stopped', metadata, containers: [] }
  }

  const containers = await listProjectContainers(metadata.projectName)
  return {
    exists: true,
    state: deriveState(metadata, containers),
    metadata,
    containers
  }
}

export const startSandbox = async (sessionId: string): Promise<SandboxStatus> => {
  const metadata = readMetadata(sessionId)
  if (!metadata) {
    throw new Error(`No sandbox exists for session ${sessionId}.`)
  }
  await upSandbox(metadata)
  return getStatus(sessionId)
}

export const stopSandbox = async (sessionId: string): Promise<SandboxStatus> => {
  const metadata = readMetadata(sessionId)
  if (!metadata) {
    return { exists: false, state: 'missing', containers: [] }
  }

  invalidateSessionExecs(sessionId)

  const availability = await getAvailability()
  const ctx = toComposeContext(metadata, availability)

  if (ctx) {
    const result = await compose(ctx, ['stop'], { timeoutMs: 120_000 })
    if (result.exitCode !== 0) {
      logger.warn('compose stop reported a failure', {
        sessionId,
        stderr: result.stderr.trim()
      })
    }
  } else {
    for (const service of metadata.services) {
      await run('docker', ['stop', containerNameFor(metadata, service.name)])
    }
  }

  logger.info('Sandbox stopped', { sessionId })
  return getStatus(sessionId)
}

/**
 * Tear the sandbox down. Containers and networks always go; `deleteData` also removes the
 * sandbox folder and its mapped data volumes.
 */
export const removeSandbox = async (
  sessionId: string,
  options: SandboxRemoveOptions = {}
): Promise<{ removed: boolean; dataDeleted: boolean }> => {
  const metadata = readMetadata(sessionId)
  if (!metadata) {
    return { removed: false, dataDeleted: false }
  }

  invalidateSessionExecs(sessionId)

  const availability = await getAvailability()
  const ctx = toComposeContext(metadata, availability)

  if (availability.dockerInstalled && availability.daemonRunning) {
    if (ctx) {
      const args = options.deleteData
        ? ['down', '-v', '--remove-orphans']
        : ['down', '--remove-orphans']
      const result = await compose(ctx, args, { timeoutMs: 180_000 })
      if (result.exitCode !== 0) {
        logger.warn('compose down reported a failure', {
          sessionId,
          stderr: result.stderr.trim()
        })
      }
    } else {
      for (const service of metadata.services) {
        await run('docker', ['rm', '-f', containerNameFor(metadata, service.name)])
      }
    }
  } else {
    logger.warn('Removing sandbox files without Docker; containers may remain', { sessionId })
  }

  let dataDeleted = false
  if (options.deleteData) {
    fs.rmSync(metadata.directory, { recursive: true, force: true })
    dataDeleted = true
  } else {
    // Keep the folder, but drop the metadata so the sandbox is no longer considered to
    // exist. The compose file and data/ stay for the user to recover from.
    fs.rmSync(path.join(metadata.directory, METADATA_FILENAME), { force: true })
  }

  logger.info('Sandbox removed', { sessionId, dataDeleted })
  return { removed: true, dataDeleted }
}

/**
 * Run a command inside a session's sandbox, creating it on first use.
 */
export const execCommand = async (
  sessionId: string,
  command: string,
  options: SandboxExecOptions = {}
): Promise<SandboxExecResult> => {
  const metadata = await ensureSandbox(sessionId)
  const target = await toExecTarget(metadata, options.service)

  return execInSandbox(target, command, {
    ...options,
    timeout: options.timeout ?? getConfig().timeout
  })
}

export const sendInput = (pid: number, stdin: string): Promise<SandboxExecResult> =>
  sendInputToSandbox(pid, stdin)

export const isTrackedSandboxPid = (pid: number): boolean => isSandboxPid(pid)

export const getLogs = async (
  sessionId: string,
  options: { service?: string; tail?: number } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  const metadata = readMetadata(sessionId)
  if (!metadata) {
    throw new Error(`No sandbox exists for session ${sessionId}.`)
  }
  const target = await toExecTarget(metadata, options.service)
  return readSandboxLogs(target, options.tail ?? 200)
}

/**
 * Every session id that currently has a sandbox on disk. Used by the chat-delete sweep,
 * which must reach sandboxes whose chats the sidebar filters out.
 */
export const listSandboxSessionIds = (): string[] => {
  try {
    const root = getSandboxRoot()
    if (!fs.existsSync(root)) return []

    const sessionIds: string[] = []

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue

      // Folders are named after the chat title, so the session id has to come from the
      // metadata rather than the directory name.
      const file = path.join(root, entry.name, METADATA_FILENAME)
      if (!fs.existsSync(file)) continue

      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as SandboxMetadata
        if (parsed.sessionId) sessionIds.push(parsed.sessionId)
      } catch {
        // A half-written metadata file should not hide every other sandbox.
      }
    }

    return sessionIds
  } catch (error) {
    logger.warn('Failed to enumerate sandboxes', {
      error: error instanceof Error ? error.message : String(error)
    })
    return []
  }
}

/**
 * Stop every sandbox. Called from the app's before-quit hook so containers don't outlive
 * the app; they come back up on next use with their installed packages intact.
 */
export const stopAllSandboxes = async (): Promise<void> => {
  const sessionIds = listSandboxSessionIds()
  if (sessionIds.length === 0) return

  logger.info('Stopping all sandboxes on quit', { count: sessionIds.length })

  await Promise.all(
    sessionIds.map((sessionId) =>
      stopSandbox(sessionId).catch((error) =>
        logger.error('Failed to stop sandbox on quit', {
          sessionId,
          error: error instanceof Error ? error.message : String(error)
        })
      )
    )
  )
}
