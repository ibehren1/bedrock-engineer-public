import fs from 'fs'
import os from 'os'
import path from 'path'
import yaml from 'js-yaml'
import { buildCompose, writeSandboxFiles } from './composeWriter'
import { DEFAULT_SANDBOX_CONFIG, DEFAULT_SANDBOX_IMAGE, WORKSPACE_MOUNT } from './types'

const config = DEFAULT_SANDBOX_CONFIG
const projectPath = '/tmp/example-project'
const sandboxDir = path.join(projectPath, 'docker-sandboxes', 'session_1')

const servicesOf = (document: Record<string, any>) => document.services as Record<string, any>

describe('buildCompose - generated default', () => {
  it('produces a single bare ubuntu service that stays alive', () => {
    const built = buildCompose({}, sandboxDir, projectPath, config)
    const main = servicesOf(built.document).main

    expect(main.image).toBe(DEFAULT_SANDBOX_IMAGE)
    expect(main.command).toBe('sleep infinity')
    expect(main.working_dir).toBe(WORKSPACE_MOUNT)
    expect(built.services).toEqual([{ name: 'main', image: DEFAULT_SANDBOX_IMAGE, ports: [] }])
  })

  it('mounts the project directory read-write and uses a mapped data folder', () => {
    const built = buildCompose({}, sandboxDir, projectPath, config)

    expect(servicesOf(built.document).main.volumes).toEqual([
      `\${PROJECT_PATH}:${WORKSPACE_MOUNT}`,
      './data/main:/data'
    ])
  })

  it('applies the configured resource limits', () => {
    const built = buildCompose({}, sandboxDir, projectPath, {
      memoryLimit: '512m',
      cpuLimit: 1.5,
      timeout: 60
    })
    const main = servicesOf(built.document).main

    expect(main.mem_limit).toBe('512m')
    expect(main.cpus).toBe(1.5)
  })

  it('publishes agent-declared ports', () => {
    const built = buildCompose(
      { services: [{ name: 'web', ports: [{ host: 3000, container: 3000 }] }] },
      sandboxDir,
      projectPath,
      config
    )

    expect(servicesOf(built.document).web.ports).toEqual(['3000:3000'])
    expect(built.services[0].ports).toEqual([{ host: 3000, container: 3000 }])
  })

  it('rejects invalid and duplicated service names', () => {
    expect(() =>
      buildCompose({ services: [{ name: 'Bad Name' }] }, sandboxDir, projectPath, config)
    ).toThrow(/Invalid service name/)

    expect(() =>
      buildCompose(
        { services: [{ name: 'api' }, { name: 'api' }] },
        sandboxDir,
        projectPath,
        config
      )
    ).toThrow(/Duplicate service name/)
  })
})

describe('buildCompose - agent-authored YAML', () => {
  it('rewrites named volumes to mapped folders under data/', () => {
    const built = buildCompose(
      {
        composeYaml: `
volumes:
  pgdata: {}
services:
  db:
    image: postgres:17
    volumes:
      - pgdata:/var/lib/postgresql/data
`
      },
      sandboxDir,
      projectPath,
      config
    )

    expect(built.document.volumes).toBeUndefined()
    expect(servicesOf(built.document).db.volumes).toContain(
      './data/pgdata:/var/lib/postgresql/data'
    )
    expect(built.warnings.join(' ')).toMatch(/pgdata/)
  })

  it('always adds the workspace mount', () => {
    const built = buildCompose(
      { composeYaml: 'services:\n  app:\n    image: ubuntu:26.04\n' },
      sandboxDir,
      projectPath,
      config
    )

    expect(servicesOf(built.document).app.volumes[0]).toBe(`\${PROJECT_PATH}:${WORKSPACE_MOUNT}`)
  })

  it('rejects a bind mount outside the project directory', () => {
    expect(() =>
      buildCompose(
        {
          composeYaml: 'services:\n  app:\n    image: ubuntu:26.04\n    volumes:\n      - /:/host\n'
        },
        sandboxDir,
        projectPath,
        config
      )
    ).toThrow(/outside the project directory/)
  })

  it('accepts a bind mount inside the project directory', () => {
    const built = buildCompose(
      {
        composeYaml: `services:\n  app:\n    image: ubuntu:26.04\n    volumes:\n      - ${projectPath}/assets:/assets\n`
      },
      sandboxDir,
      projectPath,
      config
    )

    expect(servicesOf(built.document).app.volumes).toContain('../../assets:/assets')
  })

  it.each([
    ['privileged', 'services:\n  app:\n    image: ubuntu:26.04\n    privileged: true\n'],
    ['cap_add', 'services:\n  app:\n    image: ubuntu:26.04\n    cap_add:\n      - SYS_ADMIN\n'],
    ['pid', 'services:\n  app:\n    image: ubuntu:26.04\n    pid: host\n'],
    [
      'security_opt',
      'services:\n  app:\n    image: ubuntu:26.04\n    security_opt:\n      - seccomp=unconfined\n'
    ]
  ])('rejects %s because it weakens isolation', (key, composeYaml) => {
    expect(() => buildCompose({ composeYaml }, sandboxDir, projectPath, config)).toThrow(
      new RegExp(key)
    )
  })

  it('rejects host networking', () => {
    expect(() =>
      buildCompose(
        { composeYaml: 'services:\n  app:\n    image: ubuntu:26.04\n    network_mode: host\n' },
        sandboxDir,
        projectPath,
        config
      )
    ).toThrow(/Only the default bridge network/)
  })

  it('rejects build directives', () => {
    expect(() =>
      buildCompose(
        { composeYaml: 'services:\n  app:\n    build: .\n' },
        sandboxDir,
        projectPath,
        config
      )
    ).toThrow(/prebuilt images only/)
  })

  it('rejects YAML with no services', () => {
    expect(() =>
      buildCompose({ composeYaml: 'version: "3"\n' }, sandboxDir, projectPath, config)
    ).toThrow(/at least one service/)
  })

  it('rejects malformed YAML with a useful message', () => {
    expect(() =>
      buildCompose({ composeYaml: 'services: [unclosed' }, sandboxDir, projectPath, config)
    ).toThrow(/not valid YAML/)
  })

  it('normalizes port strings, including an ip-prefixed form', () => {
    const built = buildCompose(
      {
        composeYaml:
          'services:\n  app:\n    image: ubuntu:26.04\n    ports:\n      - "127.0.0.1:8080:80"\n'
      },
      sandboxDir,
      projectPath,
      config
    )

    expect(built.services[0].ports).toEqual([{ host: 8080, container: 80 }])
    expect(servicesOf(built.document).app.ports).toEqual(['8080:80'])
  })

  it('overrides resource limits the agent tried to set', () => {
    const built = buildCompose(
      {
        composeYaml:
          'services:\n  app:\n    image: ubuntu:26.04\n    mem_limit: 64g\n    cpus: 32\n'
      },
      sandboxDir,
      projectPath,
      config
    )
    const app = servicesOf(built.document).app

    expect(app.mem_limit).toBe(config.memoryLimit)
    expect(app.cpus).toBe(config.cpuLimit)
  })
})

describe('writeSandboxFiles', () => {
  let tmpProject: string
  let tmpSandbox: string

  beforeEach(() => {
    tmpProject = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-test-'))
    tmpSandbox = path.join(tmpProject, 'docker-sandboxes', 'session_1')
  })

  afterEach(() => {
    fs.rmSync(tmpProject, { recursive: true, force: true })
  })

  it('writes the compose file, env file, and data directories', () => {
    const built = buildCompose(
      { services: [{ name: 'main', dataVolumes: [{ name: 'cache', containerPath: '/cache' }] }] },
      tmpSandbox,
      tmpProject,
      config
    )

    const { composeFile, envFile } = writeSandboxFiles({
      sandboxDir: tmpSandbox,
      projectName: 'bedrock-sandbox-session-1',
      projectPath: tmpProject,
      built,
      env: { EXTRA: 'value' }
    })

    const parsed = yaml.load(fs.readFileSync(composeFile, 'utf-8')) as Record<string, any>
    expect(servicesOf(parsed).main.image).toBe(DEFAULT_SANDBOX_IMAGE)

    const env = fs.readFileSync(envFile, 'utf-8')
    expect(env).toContain('COMPOSE_PROJECT_NAME=bedrock-sandbox-session-1')
    expect(env).toContain(`PROJECT_PATH=${tmpProject}`)
    // A bare ubuntu image prompts on apt without this.
    expect(env).toContain('DEBIAN_FRONTEND=noninteractive')
    expect(env).toContain('EXTRA=value')

    // Created up front so Docker does not make them root-owned.
    expect(fs.existsSync(path.join(tmpSandbox, 'data', 'main'))).toBe(true)
    expect(fs.existsSync(path.join(tmpSandbox, 'data', 'cache'))).toBe(true)
  })
})
