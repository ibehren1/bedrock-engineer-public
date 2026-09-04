import fs from 'fs'
import path from 'path'
import { createCategoryLogger } from '../../common/logger'
import { store } from '../../preload/store'

const logger = createCategoryLogger('chat:session-title')

/**
 * Read a chat's current title straight from the session file the chat history writes.
 *
 * Both the sandbox and the attachments folder are named after the chat, and both can be
 * created without a renderer involved, so the title has to be resolvable from the main
 * process.
 */
export const readChatTitle = (sessionId: string): string | undefined => {
  try {
    const userDataPath = store.get('userDataPath') as string | undefined
    if (!userDataPath) return undefined

    const file = path.join(userDataPath, 'chat-sessions', `${sessionId}.json`)
    if (!fs.existsSync(file)) return undefined

    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as { title?: string }
    return typeof parsed.title === 'string' ? parsed.title : undefined
  } catch (error) {
    logger.debug('Could not read chat title for folder naming', {
      sessionId,
      error: error instanceof Error ? error.message : String(error)
    })
    return undefined
  }
}
