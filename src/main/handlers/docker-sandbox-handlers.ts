import fs from 'fs'
import { IpcMainInvokeEvent, shell } from 'electron'
import {
  createSandbox,
  execCommand,
  getAvailability,
  getLogs,
  getStatus,
  isTrackedSandboxPid,
  listSandboxSessionIds,
  removeSandbox,
  renameSandbox,
  sendInput,
  startSandbox,
  stopSandbox
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
  }
} as const
