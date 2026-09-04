import { ChildProcess, spawn } from 'child_process'
import { createCategoryLogger } from '../../../common/logger'
import { detectErrors, detectServerReady, detectWaitingForInput } from '../command/outputPatterns'
import { composeArgv, ComposeContext, run } from './composeRunner'
import { SandboxExecOptions, SandboxExecResult, WORKSPACE_MOUNT } from './types'

const logger = createCategoryLogger('docker:sandbox-exec')

interface RunningExec {
  sessionId: string
  service: string
  command: string
  child: ChildProcess
  stdout: string
  stderr: string
  exitCode: number | null
  isRunning: boolean
}

/**
 * Live `docker exec` client processes, keyed by the local client PID. A command that
 * stopped for input keeps its entry here so a follow-up `{ pid, stdin }` call can find
 * it. Entries are dropped when the process exits or the sandbox is stopped.
 */
const runningExecs = new Map<number, RunningExec>()

export interface ExecTarget {
  sessionId: string
  service: string
  /** Compose context, or null when running composeless via `docker exec`. */
  compose: ComposeContext | null
  /** Container name, required for the composeless path. */
  containerName?: string
}

/**
 * Build the argv for a single exec.
 *
 * `-i` keeps stdin open so interactive prompts can be answered. `-t` is deliberately
 * omitted: a TTY injects ANSI escape sequences into the output that the prompt and
 * server-ready matchers read, which makes detection unreliable.
 */
const buildExecArgv = (
  target: ExecTarget,
  command: string,
  options: SandboxExecOptions
): { bin: string; args: string[]; cwd?: string } => {
  const workdir = options.cwd ?? WORKSPACE_MOUNT
  const shellArgs = ['sh', '-lc', command]

  if (target.compose) {
    const { command: bin, baseArgs } = composeArgv(
      target.compose.flavor,
      target.compose.composeFile,
      target.compose.envFile
    )
    const execArgs = ['exec', '-i', '--workdir', workdir]
    if (options.detach) execArgs.push('-d')
    return {
      bin,
      args: [...baseArgs, ...execArgs, target.service, ...shellArgs],
      cwd: target.compose.cwd
    }
  }

  if (!target.containerName) {
    throw new Error('Composeless exec requires a container name')
  }

  const execArgs = ['exec', '-i', '--workdir', workdir]
  if (options.detach) execArgs.push('-d')
  return { bin: 'docker', args: [...execArgs, target.containerName, ...shellArgs] }
}

/**
 * Run a command inside a sandbox container.
 *
 * Behavior deliberately mirrors the host path in CommandService: the promise resolves
 * early when the output looks like an interactive prompt (returning the client PID so
 * the caller can send stdin) or like a dev server that has come up, and the underlying
 * process is left running in both cases.
 */
export const execInSandbox = (
  target: ExecTarget,
  command: string,
  options: SandboxExecOptions = {}
): Promise<SandboxExecResult> =>
  new Promise((resolve, reject) => {
    let argv: { bin: string; args: string[]; cwd?: string }
    try {
      argv = buildExecArgv(target, command, options)
    } catch (error) {
      reject(error)
      return
    }

    const child = spawn(argv.bin, argv.args, {
      cwd: argv.cwd,
      stdio: 'pipe',
      windowsHide: true
    })

    if (typeof child.pid === 'undefined') {
      reject(new Error(`Failed to start docker exec for session ${target.sessionId}`))
      return
    }

    const pid = child.pid
    const state: RunningExec = {
      sessionId: target.sessionId,
      service: target.service,
      command,
      child,
      stdout: '',
      stderr: '',
      exitCode: null,
      isRunning: true
    }
    runningExecs.set(pid, state)

    let settled = false
    const timeoutMs = (options.timeout ?? 300) * 1000

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      // Leave the process alone but stop waiting on it; a long build should not be
      // killed just because the model's turn needs an answer.
      resolve({
        stdout: state.stdout,
        stderr: state.stderr,
        exitCode: 124,
        processInfo: { pid, command, detached: true },
        prompt: `Command still running after ${options.timeout ?? 300}s. Use dockerSandbox logs, or send input with pid ${pid}.`
      })
    }, timeoutMs)

    const settle = (result: SandboxExecResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    child.stdout?.on('data', (data) => {
      state.stdout += data.toString()

      const waiting = detectWaitingForInput(state.stdout)
      if (waiting.isWaiting) {
        settle({
          stdout: state.stdout,
          stderr: state.stderr,
          exitCode: 0,
          processInfo: { pid, command, detached: false },
          requiresInput: true,
          prompt: waiting.prompt
        })
        return
      }

      if (detectServerReady(state.stdout) && !detectErrors(state.stdout, state.stderr)) {
        settle({
          stdout: state.stdout,
          stderr: state.stderr,
          exitCode: 0,
          processInfo: { pid, command, detached: true }
        })
      }
    })

    child.stderr?.on('data', (data) => {
      state.stderr += data.toString()

      const waiting = detectWaitingForInput(state.stderr)
      if (waiting.isWaiting) {
        settle({
          stdout: state.stdout,
          stderr: state.stderr,
          exitCode: 0,
          processInfo: { pid, command, detached: false },
          requiresInput: true,
          prompt: waiting.prompt
        })
      }
    })

    child.on('error', (error) => {
      state.isRunning = false
      runningExecs.delete(pid)
      clearTimeout(timer)
      if (!settled) {
        settled = true
        reject(error)
      }
    })

    child.on('close', (code) => {
      state.isRunning = false
      state.exitCode = code ?? 1
      runningExecs.delete(pid)

      settle({
        stdout: state.stdout,
        stderr: state.stderr,
        exitCode: code ?? 1,
        detached: options.detach
      })
    })

    if (options.detach) {
      // `exec -d` returns as soon as the command is started; nothing will be written.
      child.stdin?.end()
    }
  })

/**
 * Write to the stdin of a still-running sandbox command. The PID is the local docker
 * client's, which forwards stdin into the container.
 */
export const sendInputToSandbox = (
  pid: number,
  stdin: string,
  timeoutSeconds = 15
): Promise<SandboxExecResult> =>
  new Promise((resolve, reject) => {
    const state = runningExecs.get(pid)

    if (!state || !state.isRunning) {
      reject(
        new Error(
          `No running sandbox command found with PID ${pid}. The container may have been stopped or the command already finished — re-run the command instead of sending input.`
        )
      )
      return
    }

    const before = { stdout: state.stdout.length, stderr: state.stderr.length }
    let settled = false

    const settle = (result: SandboxExecResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const timer = setTimeout(() => {
      settle({
        stdout: state.stdout.slice(before.stdout),
        stderr: state.stderr.slice(before.stderr),
        exitCode: 0,
        processInfo: { pid, command: state.command, detached: false }
      })
    }, timeoutSeconds * 1000)

    const onData = () => {
      const newOutput = state.stdout.slice(before.stdout)
      const waiting = detectWaitingForInput(newOutput)
      if (waiting.isWaiting) {
        settle({
          stdout: newOutput,
          stderr: state.stderr.slice(before.stderr),
          exitCode: 0,
          processInfo: { pid, command: state.command, detached: false },
          requiresInput: true,
          prompt: waiting.prompt
        })
      }
    }

    state.child.stdout?.on('data', onData)
    state.child.once('close', (code) => {
      settle({
        stdout: state.stdout.slice(before.stdout),
        stderr: state.stderr.slice(before.stderr),
        exitCode: code ?? 1
      })
    })

    state.child.stdin?.write(stdin.endsWith('\n') ? stdin : `${stdin}\n`)
  })

/**
 * Drop tracked exec processes for a session. Called when a sandbox is stopped or removed
 * so a later stdin follow-up fails with a clear message instead of writing into a pipe
 * whose container is gone.
 */
export const invalidateSessionExecs = (sessionId: string): void => {
  for (const [pid, state] of runningExecs.entries()) {
    if (state.sessionId !== sessionId) continue
    try {
      state.child.kill('SIGTERM')
    } catch (error) {
      logger.debug('Failed to signal exec client', {
        pid,
        error: error instanceof Error ? error.message : String(error)
      })
    }
    runningExecs.delete(pid)
  }
}

/** True when the PID belongs to a tracked sandbox exec (vs. a host command). */
export const isSandboxPid = (pid: number): boolean => runningExecs.has(pid)

/**
 * Read logs for a sandbox service. Uses `docker logs` for the composeless path.
 */
export const readSandboxLogs = async (
  target: ExecTarget,
  tail: number
): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
  if (target.compose) {
    const { command, baseArgs } = composeArgv(
      target.compose.flavor,
      target.compose.composeFile,
      target.compose.envFile
    )
    const result = await run(
      command,
      [...baseArgs, 'logs', '--no-color', '--tail', String(tail), target.service],
      { cwd: target.compose.cwd }
    )
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
  }

  if (!target.containerName) {
    throw new Error('Composeless logs require a container name')
  }
  const result = await run('docker', ['logs', '--tail', String(tail), target.containerName])
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
}
