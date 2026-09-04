import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

/**
 * Naming helpers for the per-chat folders the app creates inside the project directory
 * (Docker sandboxes and attachments). Kept free of store/electron imports so they can be
 * exercised without an Electron environment.
 */

/** Longest slug taken from a chat title, so folder names stay manageable. */
const MAX_SLUG_LENGTH = 40

/**
 * Short, stable discriminator derived from the session id. Keeps two chats that happen to
 * share a title in separate folders, without putting a 13-digit timestamp in the name.
 */
export const toShortId = (sessionId: string): string =>
  crypto.createHash('sha1').update(sessionId).digest('hex').slice(0, 6)

/**
 * Turn a chat title into a filesystem-safe slug. Returns an empty string when the title
 * has nothing usable in it, so callers can fall back.
 */
export const slugifyTitle = (title: string): string =>
  title
    .toLowerCase()
    .normalize('NFKD')
    // Drop combining marks so accented characters reduce to their base letter.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')

/**
 * Human-readable folder name for a chat: the chat's title plus a short id.
 *
 * The folder is what a person browses in their project directory, so it carries the
 * title. It is not the compose project name, which stays keyed on the session id.
 */
export const toFolderName = (sessionId: string, title?: string): string => {
  const slug = title ? slugifyTitle(title) : ''
  const shortId = toShortId(sessionId)
  return slug ? `${slug}-${shortId}` : `session-${shortId}`
}

/**
 * True when a chat still carries the title it was created with.
 *
 * ChatSessionManager names new sessions `Chat <locale date>`, and the sidebar's
 * title generator treats that same prefix as "not yet titled".
 */
export const isDefaultChatTitle = (title?: string): boolean => !title || title.startsWith('Chat ')

/**
 * Find the folder a chat owns inside `root`.
 *
 * Every folder name ends in `-<toShortId(sessionId)>` (or is exactly `session-<shortId>`),
 * and the short id is a pure function of the session id, so the owner can be recovered from
 * the name alone — no metadata file has to be written into a folder the user browses.
 */
export const findChatFolderByShortId = (root: string, sessionId: string): string | undefined => {
  const suffix = `-${toShortId(sessionId)}`
  try {
    if (!fs.existsSync(root)) return undefined

    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name.endsWith(suffix)) return path.join(root, entry.name)
    }
  } catch {
    // An unreadable root just means the chat has no folder yet.
  }
  return undefined
}
