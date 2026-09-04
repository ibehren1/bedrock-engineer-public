import { BrowserWindow, dialog, IpcMainInvokeEvent, shell } from 'electron'
import {
  addAttachments,
  addAttachmentsFromPaths,
  buildAttachmentContext,
  ensureAttachmentsDir,
  listAttachments,
  removeAllAttachments,
  removeAttachment,
  removeEveryAttachmentsFolder,
  renameAttachmentsDir
} from '../api/attachments'

/**
 * IPC surface for chat attachments.
 *
 * All filesystem work lives in the main process so the size, format and path-containment
 * checks happen in exactly one place for all three ingestion paths (drop, paste, picker).
 */
export const chatAttachmentsHandlers = {
  'chat-attachments-list': async (_event: IpcMainInvokeEvent, params: { sessionId: string }) => {
    return listAttachments(params.sessionId)
  },

  'chat-attachments-add': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string; files: { name: string; bytes: Uint8Array }[] }
  ) => {
    return addAttachments(params.sessionId, params.files)
  },

  // Native multi-select picker. Files are copied into the chat's folder, leaving the
  // originals where the user keeps them.
  'chat-attachments-add-from-picker': async (
    event: IpcMainInvokeEvent,
    params: { sessionId: string }
  ) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showOpenDialog(window, {
          properties: ['openFile', 'multiSelections'],
          title: 'Add files to this chat'
        })
      : await dialog.showOpenDialog({
          properties: ['openFile', 'multiSelections'],
          title: 'Add files to this chat'
        })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, ...listAttachments(params.sessionId), added: [], errors: [] }
    }

    return {
      canceled: false,
      ...(await addAttachmentsFromPaths(params.sessionId, result.filePaths))
    }
  },

  'chat-attachments-remove': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string; name: string }
  ) => {
    return removeAttachment(params.sessionId, params.name)
  },

  'chat-attachments-remove-all': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string }
  ) => {
    return removeAllAttachments(params.sessionId)
  },

  'chat-attachments-remove-every-folder': async () => {
    return removeEveryAttachmentsFolder()
  },

  'chat-attachments-rename': async (_event: IpcMainInvokeEvent, params: { sessionId: string }) => {
    return renameAttachmentsDir(params.sessionId)
  },

  'chat-attachments-build-context': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string }
  ) => {
    return buildAttachmentContext(params.sessionId)
  },

  // Reveal a chat's attachments folder in the OS file manager.
  //
  // shell.openPath handles all three platforms and resolves to a non-empty string on failure
  // rather than throwing, which is the case a Linux box with no xdg-utils hits. The folder is
  // created first so the menu item always opens something.
  'chat-attachments-open-folder': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string }
  ) => {
    let directory: string
    try {
      directory = ensureAttachmentsDir(params.sessionId)
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }

    const errorMessage = await shell.openPath(directory)
    if (errorMessage) {
      return { success: false, error: `Could not open ${directory}: ${errorMessage}` }
    }

    return { success: true, path: directory }
  }
} as const
