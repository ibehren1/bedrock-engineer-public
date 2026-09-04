import fs from 'fs'
import path from 'path'
import { IpcMainInvokeEvent } from 'electron'
import { createCategoryLogger } from '../../common/logger'
import { ensureAttachmentsDir } from '../api/attachments'
import { readUserGuide, USER_GUIDE_ATTACHMENT_NAME } from '../lib/userGuide'

const logger = createCategoryLogger('help:ipc')

/**
 * Outcome of preparing the guide for a Help chat.
 *
 * Attaching needs a project directory, because that is where chat attachment folders live. When
 * there isn't one the guide still has to reach the model, so its text comes back instead and the
 * renderer folds it into the Help agent's system prompt.
 */
export type PrepareUserGuideResult =
  | { attached: true; name: string; path: string }
  | { attached: false; reason: string; text: string }

export const helpHandlers = {
  'help-prepare-user-guide': async (
    _event: IpcMainInvokeEvent,
    params: { sessionId: string }
  ): Promise<PrepareUserGuideResult> => {
    const guide = await readUserGuide()

    try {
      const directory = ensureAttachmentsDir(params.sessionId)
      const target = path.join(directory, USER_GUIDE_ATTACHMENT_NAME)

      // Written directly rather than through `addAttachments`, whose de-duplicating rename would
      // leave a -1, -2, … copy behind every time the Help chat is reopened. Rewriting on a length
      // mismatch is what refreshes the guide after the app is updated.
      const current = await fs.promises.stat(target).catch(() => undefined)
      if (!current || current.size !== Buffer.byteLength(guide, 'utf-8')) {
        await fs.promises.writeFile(target, guide, 'utf-8')
      }

      return { attached: true, name: USER_GUIDE_ATTACHMENT_NAME, path: target }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.info('Falling back to the system prompt for the user guide', {
        sessionId: params.sessionId,
        reason
      })
      return { attached: false, reason, text: guide }
    }
  }
}
