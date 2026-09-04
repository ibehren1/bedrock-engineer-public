import { spawn } from 'child_process'
import { createCategoryLogger } from '../../../common/logger'
import { ComposeFlavor, DockerAvailability } from './types'

const logger = createCategoryLogger('docker:availability')

const PROBE_TIMEOUT_MS = 8000

interface ProbeResult {
  ok: boolean
  stdout: string
  stderr: string
}

/**
 * Run a short-lived probe command and capture its output. Never rejects — a missing
 * binary and a non-zero exit both come back as `ok: false` so callers can branch on
 * one shape.
 */
const probe = (command: string, args: string[]): Promise<ProbeResult> =>
  new Promise((resolve) => {
    let settled = false
    const finish = (result: ProbeResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result)
    }

    const child = spawn(command, args, { stdio: 'pipe' })

    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      child.kill()
      finish({ ok: false, stdout, stderr: stderr || `${command} ${args[0]} timed out` })
    }, PROBE_TIMEOUT_MS)

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })
    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })
    child.on('error', (error) => finish({ ok: false, stdout, stderr: error.message }))
    child.on('close', (code) => finish({ ok: code === 0, stdout, stderr }))
  })

/**
 * Platform-specific install steps. Returned to the agent so it can relay them in chat
 * when the sandbox can't start.
 */
export const getInstallGuidance = (missing: 'docker' | 'daemon' | 'compose'): string => {
  const platform = process.platform

  if (missing === 'daemon') {
    if (platform === 'darwin' || platform === 'win32') {
      return 'Docker is installed but the daemon is not running. Start Docker Desktop and wait for its status to read "running", then retry.'
    }
    return 'Docker is installed but the daemon is not running. Start it with `sudo systemctl start docker` (and `sudo systemctl enable docker` to start it at boot), then retry.'
  }

  if (missing === 'compose') {
    if (platform === 'darwin' || platform === 'win32') {
      return 'Docker Compose is missing. It ships with Docker Desktop — update Docker Desktop to a current version to get the `docker compose` plugin. The sandbox will fall back to a single container without it.'
    }
    return 'Docker Compose is missing. Install the plugin with `sudo apt-get install docker-compose-plugin` (Debian/Ubuntu) or `sudo dnf install docker-compose-plugin` (Fedora/RHEL). The sandbox will fall back to a single container without it.'
  }

  if (platform === 'darwin') {
    return 'Docker is not installed. Install Docker Desktop with `brew install --cask docker`, or download it from https://www.docker.com/products/docker-desktop/. Launch Docker Desktop once installed, then retry.'
  }
  if (platform === 'win32') {
    return 'Docker is not installed. Install Docker Desktop with `winget install Docker.DockerDesktop`, or download it from https://www.docker.com/products/docker-desktop/. Launch Docker Desktop once installed, then retry.'
  }
  return 'Docker is not installed. On Debian/Ubuntu: `sudo apt-get install docker.io docker-compose-plugin`. On Fedora/RHEL: `sudo dnf install docker docker-compose-plugin`. Then `sudo systemctl start docker` and add yourself to the `docker` group with `sudo usermod -aG docker $USER` (log out and back in for that to take effect).'
}

/**
 * Probe the local Docker installation: CLI, daemon, and compose flavor.
 *
 * Compose v2 (`docker compose`) is preferred; v1 (`docker-compose`) is accepted as a
 * fallback. When neither is present the sandbox still works for a single container
 * via plain `docker run`.
 */
export const checkDockerAvailability = async (): Promise<DockerAvailability> => {
  const lastChecked = new Date()

  const version = await probe('docker', ['--version'])
  if (!version.ok) {
    return {
      dockerInstalled: false,
      daemonRunning: false,
      compose: 'none',
      error: version.stderr.trim() || 'Docker CLI not found on PATH',
      installGuidance: getInstallGuidance('docker'),
      lastChecked
    }
  }

  const dockerVersion = version.stdout.match(/Docker version (\S+?),?\s/)?.[1] ?? 'unknown'

  const info = await probe('docker', ['info', '--format', '{{.ServerVersion}}'])
  if (!info.ok) {
    return {
      dockerInstalled: true,
      dockerVersion,
      daemonRunning: false,
      compose: 'none',
      error: info.stderr.trim() || 'Docker daemon is not reachable',
      installGuidance: getInstallGuidance('daemon'),
      lastChecked
    }
  }

  let compose: ComposeFlavor = 'none'
  let composeVersion: string | undefined

  const pluginCompose = await probe('docker', ['compose', 'version', '--short'])
  if (pluginCompose.ok) {
    compose = 'plugin'
    composeVersion = pluginCompose.stdout.trim()
  } else {
    const standalone = await probe('docker-compose', ['--version'])
    if (standalone.ok) {
      compose = 'standalone'
      composeVersion = standalone.stdout.match(/(\d+\.\d+\.\d+)/)?.[1] ?? 'unknown'
    }
  }

  const result: DockerAvailability = {
    dockerInstalled: true,
    dockerVersion,
    daemonRunning: true,
    compose,
    composeVersion,
    lastChecked
  }

  if (compose === 'none') {
    result.installGuidance = getInstallGuidance('compose')
  }

  logger.debug('Docker availability probed', {
    dockerVersion,
    compose,
    composeVersion
  })

  return result
}

/**
 * Throw a message suitable for relaying to the agent when the sandbox cannot run.
 * Compose being absent is not fatal — single-container sandboxes still work.
 */
export const assertSandboxUsable = (availability: DockerAvailability): void => {
  if (!availability.dockerInstalled) {
    throw new Error(
      `${availability.error ?? 'Docker is not installed'}\n\n${getInstallGuidance('docker')}`
    )
  }
  if (!availability.daemonRunning) {
    throw new Error(
      `${availability.error ?? 'Docker daemon is not running'}\n\n${getInstallGuidance('daemon')}`
    )
  }
}
