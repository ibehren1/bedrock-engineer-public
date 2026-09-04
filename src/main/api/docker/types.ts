/**
 * Types for the per-chat Docker sandbox.
 */

/** Default image for a generated sandbox. Bare — the agent installs what it needs. */
export const DEFAULT_SANDBOX_IMAGE = 'ubuntu:26.04'

/** Service name used by the generated single-service compose file. */
export const DEFAULT_SERVICE_NAME = 'main'

/** Mount point of the user's projectPath inside every sandbox container. */
export const WORKSPACE_MOUNT = '/workspace'

/** Folder under projectPath that holds every sandbox's compose/env/data files. */
export const SANDBOX_ROOT_DIRNAME = 'docker-sandboxes'

export type ComposeFlavor = 'plugin' | 'standalone' | 'none'

export interface DockerAvailability {
  /** `docker` CLI present and responding. */
  dockerInstalled: boolean
  dockerVersion?: string
  /** Daemon reachable (`docker info` succeeded). */
  daemonRunning: boolean
  /** Which compose implementation is usable, if any. */
  compose: ComposeFlavor
  composeVersion?: string
  /** Human-readable reason the sandbox can't run, when it can't. */
  error?: string
  /** Platform-specific install steps, present whenever something is missing. */
  installGuidance?: string
  lastChecked: Date
}

export interface SandboxPortMapping {
  /** Port published on the host. */
  host: number
  /** Port inside the container. */
  container: number
}

export interface SandboxServiceSpec {
  name: string
  image?: string
  /** Container command. Defaults to `sleep infinity` so the container stays up. */
  command?: string
  ports?: SandboxPortMapping[]
  /** Environment variables written to the service in the compose file. */
  environment?: Record<string, string>
  /**
   * Extra data directories to expose. Each entry maps
   * `<sandboxDir>/data/<name>` to the given container path.
   */
  dataVolumes?: { name: string; containerPath: string }[]
}

export interface CreateSandboxOptions {
  /** Structured service definitions. Ignored when `composeYaml` is supplied. */
  services?: SandboxServiceSpec[]
  /** Raw compose YAML authored by the agent. Validated and rewritten before use. */
  composeYaml?: string
  /** Additional variables written to the sandbox `.env` file. */
  env?: Record<string, string>
  /** Recreate from scratch even if a sandbox already exists for this session. */
  recreate?: boolean
}

export interface SandboxMetadata {
  sessionId: string
  /** Compose project name, e.g. `bedrock-sandbox-session-1756900000000`. */
  projectName: string
  /** Absolute path of the sandbox folder. */
  directory: string
  /** Absolute path of the compose file. */
  composeFile: string
  /** Absolute path of the projectPath bind-mounted at /workspace. */
  projectPath: string
  services: {
    name: string
    image: string
    ports: SandboxPortMapping[]
  }[]
  /** True when the stack is driven by `docker run` because compose is absent. */
  composeless: boolean
  createdAt: string
  updatedAt: string
}

export type SandboxRunState = 'running' | 'stopped' | 'partial' | 'missing'

export interface SandboxStatus {
  exists: boolean
  state: SandboxRunState
  metadata?: SandboxMetadata
  containers: {
    service: string
    name: string
    state: string
    ports: string
  }[]
}

export interface SandboxExecOptions {
  /** Service to exec into. Defaults to the sandbox's first service. */
  service?: string
  /** Working directory inside the container. Defaults to /workspace. */
  cwd?: string
  /** Start the command in the background and return immediately. */
  detach?: boolean
  /** Seconds before the command is abandoned. */
  timeout?: number
}

export interface SandboxExecResult {
  stdout: string
  stderr: string
  exitCode: number
  /** PID of the local `docker` client process, usable for a stdin follow-up. */
  processInfo?: { pid: number; command: string; detached: boolean }
  requiresInput?: boolean
  prompt?: string
  detached?: boolean
}

export interface SandboxRemoveOptions {
  /** Also delete the sandbox folder, including mapped data volumes. */
  deleteData?: boolean
}

/** User-configurable resource limits, persisted under the `dockerSandboxTool` store key. */
export interface DockerSandboxConfig {
  memoryLimit: string
  cpuLimit: number
  /** Per-command timeout in seconds. */
  timeout: number
}

export const DEFAULT_SANDBOX_CONFIG: DockerSandboxConfig = {
  memoryLimit: '2g',
  cpuLimit: 2.0,
  timeout: 300
}

export const VALID_MEMORY_LIMITS = ['256m', '512m', '1g', '2g', '4g', '8g'] as const
