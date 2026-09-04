import fs from 'fs'
import net from 'net'
import path from 'path'
import yaml from 'js-yaml'
import { createCategoryLogger } from '../../../common/logger'
import {
  CreateSandboxOptions,
  DEFAULT_SANDBOX_IMAGE,
  DEFAULT_SERVICE_NAME,
  DockerSandboxConfig,
  SandboxPortMapping,
  SandboxServiceSpec,
  WORKSPACE_MOUNT
} from './types'

const logger = createCategoryLogger('docker:compose-writer')

/** Compose keys that would defeat the isolation the sandbox exists to provide. */
const FORBIDDEN_SERVICE_KEYS = [
  'privileged',
  'cap_add',
  'devices',
  'pid',
  'ipc',
  'userns_mode',
  'security_opt'
]

export interface BuiltCompose {
  /** The compose document, ready to serialize. */
  document: Record<string, any>
  /** Normalized service summary for sandbox.json and the UI. */
  services: { name: string; image: string; ports: SandboxPortMapping[] }[]
  /** Warnings worth surfacing to the agent (e.g. a rewritten volume). */
  warnings: string[]
}

const parsePortMapping = (raw: unknown): SandboxPortMapping | null => {
  if (typeof raw === 'number') {
    return { host: raw, container: raw }
  }
  if (typeof raw === 'string') {
    // Accept "3000", "3000:3000", "127.0.0.1:3000:3000". Reject ranges.
    const parts = raw.split(':')
    const tail = parts.slice(-2)
    if (parts.length === 1) {
      const port = Number(parts[0])
      return Number.isFinite(port) ? { host: port, container: port } : null
    }
    const host = Number(tail[0])
    const container = Number(String(tail[1]).replace(/\/(tcp|udp)$/, ''))
    return Number.isFinite(host) && Number.isFinite(container) ? { host, container } : null
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { published?: number | string; target?: number | string }
    const host = Number(obj.published)
    const container = Number(obj.target)
    return Number.isFinite(host) && Number.isFinite(container) ? { host, container } : null
  }
  return null
}

/**
 * Check whether a TCP port can be bound on the host. Used to fail sandbox creation with
 * a clear message instead of letting `compose up` produce an opaque bind error.
 */
export const isHostPortFree = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })

export const assertPortsAvailable = async (
  services: { name: string; ports: SandboxPortMapping[] }[]
): Promise<void> => {
  const seen = new Map<number, string>()

  for (const service of services) {
    for (const mapping of service.ports) {
      const previous = seen.get(mapping.host)
      if (previous) {
        throw new Error(
          `Host port ${mapping.host} is requested by both "${previous}" and "${service.name}". Give each service a distinct host port.`
        )
      }
      seen.set(mapping.host, service.name)

      if (!(await isHostPortFree(mapping.host))) {
        throw new Error(
          `Host port ${mapping.host} (requested by service "${service.name}") is already in use. Pick a different host port, or stop whatever is listening on ${mapping.host}.`
        )
      }
    }
  }
}

const serializeVolume = (hostRelativeOrAbsolute: string, containerPath: string): string =>
  `${hostRelativeOrAbsolute}:${containerPath}`

/**
 * Build the compose document for a default, generated sandbox.
 */
const buildGeneratedCompose = (
  services: SandboxServiceSpec[],
  config: DockerSandboxConfig
): BuiltCompose => {
  const document: Record<string, any> = { services: {} }
  const summary: BuiltCompose['services'] = []

  for (const spec of services) {
    const image = spec.image ?? DEFAULT_SANDBOX_IMAGE
    const ports = spec.ports ?? []

    const volumes = [
      // projectPath is shared read-write so files move in and out of the sandbox.
      serializeVolume('${PROJECT_PATH}', WORKSPACE_MOUNT),
      // Mapped folder instead of a named volume, so data is inspectable on the host.
      serializeVolume(`./data/${spec.name}`, '/data')
    ]

    for (const extra of spec.dataVolumes ?? []) {
      volumes.push(serializeVolume(`./data/${extra.name}`, extra.containerPath))
    }

    document.services[spec.name] = {
      image,
      // Keeps a bare ubuntu container alive so we can exec into it repeatedly.
      command: spec.command ?? 'sleep infinity',
      working_dir: WORKSPACE_MOUNT,
      volumes,
      ...(ports.length > 0 ? { ports: ports.map((p) => `${p.host}:${p.container}`) } : {}),
      ...(spec.environment && Object.keys(spec.environment).length > 0
        ? { environment: spec.environment }
        : {}),
      mem_limit: config.memoryLimit,
      cpus: config.cpuLimit
    }

    summary.push({ name: spec.name, image, ports })
  }

  return { document, services: summary, warnings: [] }
}

/**
 * Validate and normalize agent-authored compose YAML.
 *
 * Named volumes are rewritten to mapped folders under the sandbox's `data/` directory,
 * host bind mounts are confined to projectPath and the sandbox folder, and the keys that
 * would break out of the container are rejected outright.
 */
const buildFromAgentYaml = (
  composeYaml: string,
  sandboxDir: string,
  projectPath: string,
  config: DockerSandboxConfig
): BuiltCompose => {
  let parsed: unknown
  try {
    parsed = yaml.load(composeYaml)
  } catch (error) {
    throw new Error(
      `composeYaml is not valid YAML: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('composeYaml must be a YAML mapping with a top-level "services" key.')
  }

  const document = parsed as Record<string, any>
  const services = document.services

  if (!services || typeof services !== 'object' || Object.keys(services).length === 0) {
    throw new Error('composeYaml must define at least one service under "services".')
  }

  const warnings: string[] = []
  const summary: BuiltCompose['services'] = []

  // Named volumes become mapped folders, so drop the top-level declarations.
  const declaredNamedVolumes = new Set(
    document.volumes && typeof document.volumes === 'object' ? Object.keys(document.volumes) : []
  )
  if (declaredNamedVolumes.size > 0) {
    delete document.volumes
    warnings.push(
      `Named volumes (${[...declaredNamedVolumes].join(', ')}) were converted to mapped folders under data/.`
    )
  }

  const resolvedProject = path.resolve(projectPath)
  const resolvedSandbox = path.resolve(sandboxDir)
  const isInside = (target: string, parent: string): boolean => {
    const relative = path.relative(parent, target)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
  }

  for (const [serviceName, rawService] of Object.entries(services)) {
    if (!rawService || typeof rawService !== 'object') {
      throw new Error(`Service "${serviceName}" must be a mapping.`)
    }
    const service = rawService as Record<string, any>

    for (const key of FORBIDDEN_SERVICE_KEYS) {
      if (key in service) {
        throw new Error(
          `Service "${serviceName}" sets "${key}", which is not permitted in a sandbox because it weakens container isolation. Remove it.`
        )
      }
    }

    if (typeof service.network_mode === 'string' && service.network_mode !== 'bridge') {
      throw new Error(
        `Service "${serviceName}" sets network_mode "${service.network_mode}". Only the default bridge network is permitted in a sandbox.`
      )
    }

    if (!service.image && !service.build) {
      service.image = DEFAULT_SANDBOX_IMAGE
    }
    if (service.build) {
      throw new Error(
        `Service "${serviceName}" uses "build". Sandboxes run prebuilt images only — use "image" and install packages with a command instead.`
      )
    }

    // Every service keeps the workspace mount and a data folder; rewrite the rest.
    const rewritten: string[] = [serializeVolume('${PROJECT_PATH}', WORKSPACE_MOUNT)]
    let sawDataMount = false

    for (const entry of Array.isArray(service.volumes) ? service.volumes : []) {
      const spec =
        typeof entry === 'string'
          ? entry
          : entry && typeof entry === 'object'
            ? `${(entry as any).source ?? ''}:${(entry as any).target ?? ''}`
            : ''

      const [source, ...targetParts] = spec.split(':')
      const target = targetParts.join(':')

      if (!source || !target) {
        warnings.push(`Dropped unrecognized volume entry on "${serviceName}": ${spec}`)
        continue
      }
      if (target === WORKSPACE_MOUNT) {
        // Already added above.
        continue
      }

      const isNamed = declaredNamedVolumes.has(source) || !/^[./~]|^[A-Za-z]:/.test(source)

      if (isNamed) {
        rewritten.push(serializeVolume(`./data/${source}`, target))
        sawDataMount = true
        continue
      }

      const absolute = path.isAbsolute(source) ? source : path.resolve(sandboxDir, source)
      if (!isInside(absolute, resolvedProject) && !isInside(absolute, resolvedSandbox)) {
        throw new Error(
          `Service "${serviceName}" bind-mounts "${source}", which is outside the project directory. Sandbox mounts are limited to the project directory and the sandbox's own folder.`
        )
      }
      const relative = path.relative(resolvedSandbox, absolute)
      rewritten.push(serializeVolume(relative.startsWith('.') ? relative : `./${relative}`, target))
      sawDataMount = true
    }

    if (!sawDataMount) {
      rewritten.push(serializeVolume(`./data/${serviceName}`, '/data'))
    }

    service.volumes = rewritten
    service.working_dir = service.working_dir ?? WORKSPACE_MOUNT
    service.command = service.command ?? 'sleep infinity'
    service.mem_limit = config.memoryLimit
    service.cpus = config.cpuLimit

    const ports: SandboxPortMapping[] = []
    for (const raw of Array.isArray(service.ports) ? service.ports : []) {
      const mapping = parsePortMapping(raw)
      if (!mapping) {
        throw new Error(
          `Service "${serviceName}" has an unsupported port entry: ${JSON.stringify(raw)}. Use "hostPort:containerPort".`
        )
      }
      ports.push(mapping)
    }
    if (ports.length > 0) {
      service.ports = ports.map((p) => `${p.host}:${p.container}`)
    }

    summary.push({ name: serviceName, image: String(service.image), ports })
  }

  return { document, services: summary, warnings }
}

/**
 * Produce the compose document for a sandbox, from either agent-supplied YAML or the
 * structured service list, falling back to a single bare ubuntu service.
 */
export const buildCompose = (
  options: CreateSandboxOptions,
  sandboxDir: string,
  projectPath: string,
  config: DockerSandboxConfig
): BuiltCompose => {
  if (options.composeYaml) {
    return buildFromAgentYaml(options.composeYaml, sandboxDir, projectPath, config)
  }

  const services =
    options.services && options.services.length > 0
      ? options.services
      : [{ name: DEFAULT_SERVICE_NAME }]

  const names = new Set<string>()
  for (const service of services) {
    if (!service.name || !/^[a-z0-9][a-z0-9_-]*$/.test(service.name)) {
      throw new Error(
        `Invalid service name "${service.name}". Use lowercase letters, digits, dashes, and underscores.`
      )
    }
    if (names.has(service.name)) {
      throw new Error(`Duplicate service name "${service.name}".`)
    }
    names.add(service.name)
  }

  return buildGeneratedCompose(services, config)
}

/**
 * Write the compose file, the .env file, and the data directories for a sandbox.
 */
export const writeSandboxFiles = (params: {
  sandboxDir: string
  projectName: string
  projectPath: string
  built: BuiltCompose
  env?: Record<string, string>
}): { composeFile: string; envFile: string } => {
  const { sandboxDir, projectName, projectPath, built, env } = params

  fs.mkdirSync(sandboxDir, { recursive: true })

  // Create every mapped data directory up front. Docker would create them as root
  // otherwise, which leaves folders the user can't delete.
  for (const [serviceName, service] of Object.entries(
    built.document.services as Record<string, any>
  )) {
    for (const volume of (service.volumes ?? []) as string[]) {
      const [source] = volume.split(':')
      if (source.startsWith('./')) {
        fs.mkdirSync(path.resolve(sandboxDir, source), { recursive: true })
      }
    }
    logger.debug('Prepared service directories', { serviceName })
  }

  const composeFile = path.join(sandboxDir, 'docker-compose.yml')
  fs.writeFileSync(
    composeFile,
    [
      '# Generated by Bedrock Engineer for a chat-scoped Docker sandbox.',
      '# Edits are overwritten when the sandbox is recreated.',
      yaml.dump(built.document, { lineWidth: 120, noRefs: true })
    ].join('\n'),
    'utf-8'
  )

  const envFile = path.join(sandboxDir, '.env')
  const envLines = [
    `COMPOSE_PROJECT_NAME=${projectName}`,
    `PROJECT_PATH=${projectPath}`,
    // A bare ubuntu image prompts on apt without this, which blocks non-interactive runs.
    'DEBIAN_FRONTEND=noninteractive',
    ...Object.entries(env ?? {}).map(([key, value]) => `${key}=${value}`)
  ]
  fs.writeFileSync(envFile, `${envLines.join('\n')}\n`, 'utf-8')

  return { composeFile, envFile }
}
