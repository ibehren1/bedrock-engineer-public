/**
 * Naming helpers for sandboxes. Kept free of store/electron imports so they can be
 * exercised without an Electron environment.
 *
 * The folder-name helpers are shared with the attachments service, so they live in
 * `src/main/lib/chatFolderNaming.ts` and are re-exported here for the docker call sites.
 */

export {
  isDefaultChatTitle,
  slugifyTitle,
  toFolderName,
  toShortId
} from '../../lib/chatFolderNaming'

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
