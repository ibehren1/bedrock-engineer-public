import { spawn } from 'child_process'
import { createCategoryLogger } from '../../../common/logger'
import { ComposeFlavor } from './types'

const logger = createCategoryLogger('docker:compose-runner')

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
  timedOut: boolean
}

export interface RunOptions {
  cwd?: string
  timeoutMs?: number
  /** Text written to the child's stdin, then closed. */
  stdin?: string
}

const DEFAULT_TIMEOUT_MS = 120_000

/**
 * Run a docker/compose command to completion. Resolves for any exit code — callers
 * decide what a non-zero exit means.
 */
export const run = (
  command: string,
  args: string[],
  options: RunOptions = {}
): Promise<RunResult> =>
  new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: 'pipe',
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      // Escalate if SIGTERM is ignored.
      setTimeout(() => child.killed || child.kill('SIGKILL'), 2000)
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)

    const finish = (exitCode: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode, timedOut })
    }

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })
    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('error', (error) => {
      stderr += error.message
      finish(127)
    })
    child.on('close', (code) => finish(code ?? (timedOut ? 124 : 1)))

    if (options.stdin !== undefined) {
      child.stdin?.write(options.stdin)
      child.stdin?.end()
    } else {
      child.stdin?.end()
    }
  })

/**
 * Base argv for a compose invocation against a specific sandbox.
 *
 * `docker compose` (v2 plugin) is preferred; `docker-compose` (v1) is the fallback.
 */
export const composeArgv = (
  flavor: Exclude<ComposeFlavor, 'none'>,
  composeFile: string,
  envFile: string
): { command: string; baseArgs: string[] } => {
  const fileArgs = ['-f', composeFile, '--env-file', envFile]
  return flavor === 'plugin'
    ? { command: 'docker', baseArgs: ['compose', ...fileArgs] }
    : { command: 'docker-compose', baseArgs: fileArgs }
}

export interface ComposeContext {
  flavor: Exclude<ComposeFlavor, 'none'>
  composeFile: string
  envFile: string
  cwd: string
}

export const compose = async (
  ctx: ComposeContext,
  args: string[],
  options: RunOptions = {}
): Promise<RunResult> => {
  const { command, baseArgs } = composeArgv(ctx.flavor, ctx.composeFile, ctx.envFile)
  const result = await run(command, [...baseArgs, ...args], { cwd: ctx.cwd, ...options })

  logger.debug('compose command finished', {
    args: args.join(' '),
    exitCode: result.exitCode,
    timedOut: result.timedOut
  })

  return result
}

/**
 * `docker ps` output for a compose project, parsed into rows. Uses `docker ps` rather
 * than `compose ps` so the same code path works for the composeless fallback, where
 * containers carry the project label but no compose file drives them.
 */
export const listProjectContainers = async (
  projectName: string
): Promise<{ service: string; name: string; state: string; ports: string }[]> => {
  const result = await run('docker', [
    'ps',
    '--all',
    '--filter',
    `label=com.docker.compose.project=${projectName}`,
    '--format',
    '{{.Label "com.docker.compose.service"}}\t{{.Names}}\t{{.State}}\t{{.Ports}}'
  ])

  if (result.exitCode !== 0) {
    logger.warn('Failed to list sandbox containers', {
      projectName,
      stderr: result.stderr.trim()
    })
    return []
  }

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [service, name, state, ports] = line.split('\t')
      return { service: service || '', name: name || '', state: state || '', ports: ports || '' }
    })
}
