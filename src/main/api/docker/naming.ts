import crypto from 'crypto'

/**
 * Naming helpers for sandboxes. Kept free of store/electron imports so they can be
 * exercised without an Electron environment.
 */

/** Longest slug taken from a chat title, so folder names stay manageable. */
const MAX_SLUG_LENGTH = 40

/**
 * Compose project names must be lowercase and cannot contain characters Docker rejects.
 * Chat session ids look like `session_1756900000000`, so the underscore is replaced.
 *
 * This stays keyed on the session id alone and never changes, so compose keeps tracking
 * a sandbox's containers by label even after its folder is renamed.
 */
export const toProjectName = (sessionId: string): string =>
  `bedrock-sandbox-${sessionId.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`.replace(/-+/g, '-')

/** Container name compose gives a service, and the name the composeless path assigns. */
export const containerNameFor = (projectName: string, service: string): string =>
  `${projectName}-${service}-1`

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
 * Human-readable folder name for a sandbox: the chat's title plus a short id.
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
