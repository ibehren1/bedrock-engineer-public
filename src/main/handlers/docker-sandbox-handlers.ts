import fs from 'fs'
import { IpcMainInvokeEvent, shell } from 'electron'
import {
  attachTerminal,
  closeTerminal,
  createSandbox,
  execCommand,
  findSessionTerminal,
  getActivity,
  getAvailability,
  getComposeFile,
  getInsights,
  getLogs,
  getStatus,
  getTerminalBacklog,
  getTerminalCapability,
  isPublishedPort,
  isTrackedSandboxPid,
  listSandboxSessionIds,
  openTerminal,
  removeSandbox,
  renameSandbox,
  resizeTerminal,
  resolveTerminalTarget,
  sendInput,
  startSandbox,
  stopSandbox,
  writeToTerminal
} from '../api/docker'
import type {
  CreateSandboxOptions,
  SandboxExecOptions,
  SandboxRemoveOptions
} from '../api/docker/types'

/**
 * IPC surface for the per-chat Docker sandbox.
 *
 * The sandbox service lives in the main process because three callers need it: the
 * preload tool, the renderer's sandbox menu, and the app's before-quit hook.
 */
export const dockerSandboxHandlers = {
  'docker-sandbox-availability': async (
    _event: IpcMainInvokeEvent,
    params?: { force?: boolean }
  ) => {
    return getAvailability(params?.force ?? false)
  },

  'docker-sandbox-create': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string; options?: CreateSandboxOptions }
  ) => {
    return createSandbox(params.sessionId, params.options ?? {})
  },

  'docker-sandbox-status': async (_event: IpcMainInvokeEvent, params: { sessionId: string }) => {
    return getStatus(params.sessionId)
  },

  'docker-sandbox-start': async (_event: IpcMainInvokeEvent, params: { sessionId: string }) => {
    return startSandbox(params.sessionId)
  },

  'docker-sandbox-stop': async (_event: IpcMainInvokeEvent, params: { sessionId: string }) => {
    return stopSandbox(params.sessionId)
  },

  'docker-sandbox-remove': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string; options?: SandboxRemoveOptions }
  ) => {
    return removeSandbox(params.sessionId, params.options ?? {})
  },

  'docker-sandbox-rename': async (_event: IpcMainInvokeEvent, params: { sessionId: string }) => {
    return renameSandbox(params.sessionId)
  },

  'docker-sandbox-logs': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string; service?: string; tail?: number }
  ) => {
    return getLogs(params.sessionId, { service: params.service, tail: params.tail })
  },

  'docker-sandbox-exec': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string; command: string; options?: SandboxExecOptions }
  ) => {
    return execCommand(params.sessionId, params.command, params.options ?? {})
  },

  'docker-sandbox-send-input': async (
    _event: IpcMainInvokeEvent,
    params: { pid: number; stdin: string }
  ) => {
    return sendInput(params.pid, params.stdin)
  },

  'docker-sandbox-has-pid': async (_event: IpcMainInvokeEvent, params: { pid: number }) => {
    return { tracked: isTrackedSandboxPid(params.pid) }
  },

  'docker-sandbox-list': async (_event: IpcMainInvokeEvent) => {
    return { sessionIds: listSandboxSessionIds() }
  },

  // Reveal a chat's sandbox folder in the OS file manager, so the compose file and the
  // mapped data folders can be inspected directly.
  //
  // shell.openPath handles all three platforms: Finder on macOS, Explorer on Windows, and
  // xdg-open on Linux. It resolves to a non-empty string on failure rather than throwing,
  // which is the case a Linux box with no xdg-utils or file manager hits.
  'docker-sandbox-open-folder': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string }
  ) => {
    const status = await getStatus(params.sessionId)
    const directory = status.metadata?.directory

    if (!directory) {
      return { success: false, error: 'This chat has no sandbox folder yet.' }
    }

    // The folder could have been deleted outside the app since the status was read. Say so
    // plainly instead of letting the platform return its own opaque message.
    if (!fs.existsSync(directory)) {
      return {
        success: false,
        error: `The sandbox folder no longer exists on disk: ${directory}`
      }
    }

    const errorMessage = await shell.openPath(directory)
    if (errorMessage) {
      return {
        success: false,
        error: `Could not open ${directory}: ${errorMessage}`
      }
    }

    return { success: true, path: directory }
  },

  // Open one of the sandbox's published ports in the default browser.
  //
  // Takes a port number, never a URL: the renderer must not be able to ask the main
  // process to open an arbitrary address, and the port has to be one this sandbox
  // actually publishes.
  'docker-sandbox-open-port': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string; port: number }
  ) => {
    if (!Number.isInteger(params.port) || params.port < 1 || params.port > 65535) {
      return { success: false, error: 'Not a valid port number.' }
    }
    if (!isPublishedPort(params.sessionId, params.port)) {
      return {
        success: false,
        error: `Port ${params.port} is not published by this sandbox.`
      }
    }

    const url = `http://localhost:${params.port}`
    await shell.openExternal(url)
    return { success: true, url }
  },

  // Identity and resource use for the panel's Overview tab.
  'docker-sandbox-insights': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string; service?: string }
  ) => {
    return getInsights(params.sessionId, params.service)
  },

  // The generated compose file, for the panel's Compose tab.
  'docker-sandbox-compose': async (_event: IpcMainInvokeEvent, params: { sessionId: string }) => {
    return getComposeFile(params.sessionId)
  },

  // Command history for the panel's Activity tab.
  'docker-sandbox-activity': async (_event: IpcMainInvokeEvent, params: { sessionId: string }) => {
    return { entries: await getActivity(params.sessionId) }
  },

  // Whether an interactive terminal is possible at all, and why not when it isn't.
  'docker-sandbox-terminal-capability': async (_event: IpcMainInvokeEvent) => {
    return getTerminalCapability()
  },

  // Open a shell, or hand back the one this chat already has.
  //
  // Note the parameters: a session id and at most a service name. Resolving the container
  // name in the main process is what keeps this from being a way to get a root shell in
  // any container on the machine.
  'docker-sandbox-terminal-open': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string; service?: string; cols?: number; rows?: number }
  ) => {
    // Reuse is per service: each container in a compose stack gets its own shell.
    const existing = findSessionTerminal(params.sessionId, params.service)
    if (existing) return existing

    const target = await resolveTerminalTarget(params.sessionId, params.service)
    return openTerminal(target, params.cols ?? 80, params.rows ?? 24)
  },

  // Start publishing. Called after the renderer has subscribed to the channel, because
  // pubsub drops anything published while nobody is listening.
  'docker-sandbox-terminal-attach': async (
    _event: IpcMainInvokeEvent,
    params: { terminalId: string }
  ) => {
    const { backlog } = attachTerminal(params.terminalId)
    return { backlog }
  },

  'docker-sandbox-terminal-input': async (
    _event: IpcMainInvokeEvent,
    params: { terminalId: string; data: string }
  ) => {
    writeToTerminal(params.terminalId, params.data)
    return { success: true }
  },

  'docker-sandbox-terminal-resize': async (
    _event: IpcMainInvokeEvent,
    params: { terminalId: string; cols: number; rows: number }
  ) => {
    await resizeTerminal(params.terminalId, params.cols, params.rows)
    return { success: true }
  },

  'docker-sandbox-terminal-backlog': async (
    _event: IpcMainInvokeEvent,
    params: { terminalId: string }
  ) => {
    return { backlog: getTerminalBacklog(params.terminalId) }
  },

  'docker-sandbox-terminal-close': async (
    _event: IpcMainInvokeEvent,
    params: { terminalId: string }
  ) => {
    closeTerminal(params.terminalId)
    return { success: true }
  }
} as const
