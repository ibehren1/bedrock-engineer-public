import fs from 'fs'
import path from 'path'
import { createCategoryLogger } from '../../../common/logger'
import { store } from '../../../preload/store'
import { findChatFolderByShortId, toFolderName } from '../../lib/chatFolderNaming'
import { readChatTitle } from '../../lib/chatSessionTitle'
import { resolveInside, sanitizeAttachmentName, uniqueNameIn } from './fileNaming'
import { isImageExtension, validateImageBytes } from './imageValidation'
import {
  ATTACHMENTS_ROOT_DIRNAME,
  AttachmentAddResult,
  AttachmentKind,
  AttachmentListing,
  AttachmentRemoveResult,
  ChatAttachment,
  EXTRACTABLE_TEXT_EXTENSIONS
} from './types'

const logger = createCategoryLogger('attachments:manager')

const getProjectPath = (): string => {
  const configured = store.get('projectPath') as string | undefined
  if (!configured) {
    throw new Error(
      'No project directory is configured. Set one in Settings before attaching files.'
    )
  }
  return configured
}

export const getAttachmentsRoot = (projectPath = getProjectPath()): string =>
  path.join(projectPath, ATTACHMENTS_ROOT_DIRNAME)

/**
 * Keep attachment folders out of the user's repository. Written once, at the root of
 * attachments/, because the folder lives inside projectPath.
 */
const ensureAttachmentsRoot = (projectPath = getProjectPath()): string => {
  const root = getAttachmentsRoot(projectPath)
  fs.mkdirSync(root, { recursive: true })

  const gitignore = path.join(root, '.gitignore')
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(
      gitignore,
      '# Chat-scoped attachments saved by Bedrock Engineer.\n*\n',
      'utf-8'
    )
  }
  return root
}

/**
 * The folder a chat's attachments live in, renamed to follow the current chat title when the
 * two disagree. Creates nothing.
 *
 * Folder names always end in the chat's short id, so the owner is recoverable from the name
 * alone — that is what lets the rename be a lazy catch-up here instead of requiring the app to
 * have been running when the title changed.
 */
export const resolveAttachmentsDir = (sessionId: string): string => {
  const root = getAttachmentsRoot()
  const desired = path.join(root, toFolderName(sessionId, readChatTitle(sessionId)))
  const existing = findChatFolderByShortId(root, sessionId)

  if (!existing) return desired
  if (path.resolve(existing) === path.resolve(desired)) return existing

  // A collision means another chat already owns that name; leave this folder where it is
  // rather than clobbering someone else's files.
  if (fs.existsSync(desired)) {
    logger.warn('Skipping attachments rename because the target folder already exists', {
      sessionId,
      desired
    })
    return existing
  }

  try {
    fs.renameSync(existing, desired)
    logger.info('Attachments folder renamed to follow the chat title', {
      sessionId,
      from: path.basename(existing),
      to: path.basename(desired)
    })
    return desired
  } catch (error) {
    logger.warn('Failed to rename attachments folder', {
      sessionId,
      from: existing,
      to: desired,
      error: error instanceof Error ? error.message : String(error)
    })
    return existing
  }
}

/** `resolveAttachmentsDir` plus the folders themselves. */
export const ensureAttachmentsDir = (sessionId: string): string => {
  ensureAttachmentsRoot()
  const directory = resolveAttachmentsDir(sessionId)
  fs.mkdirSync(directory, { recursive: true })
  return directory
}

const classify = (fileName: string): AttachmentKind => {
  const ext = path.extname(fileName).toLowerCase()
  if (isImageExtension(fileName)) return 'image'
  if (ext === '.pdf') return 'pdf'
  if (ext === '.docx') return 'docx'
  if (EXTRACTABLE_TEXT_EXTENSIONS.includes(ext)) return 'text'
  return 'other'
}

const toAttachment = (directory: string, name: string, stat: fs.Stats): ChatAttachment => {
  const kind = classify(name)
  return {
    name,
    path: path.join(directory, name),
    size: stat.size,
    mtime: stat.mtimeMs,
    kind,
    extractable: kind === 'text' || kind === 'pdf' || kind === 'docx'
  }
}

/**
 * Files currently attached to a chat, oldest first so the order matches how they were
 * attached. A chat with no folder yet simply has none.
 */
export const listAttachments = (sessionId: string): AttachmentListing => {
  let directory: string
  try {
    directory = resolveAttachmentsDir(sessionId)
  } catch {
    // No project directory configured yet: nothing can be attached.
    return { directory: '', files: [] }
  }

  if (!fs.existsSync(directory)) return { directory, files: [] }

  const files = fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
    .map((entry) =>
      toAttachment(directory, entry.name, fs.statSync(path.join(directory, entry.name)))
    )
    .sort((a, b) => a.mtime - b.mtime)

  return { directory, files }
}

/** Write dropped, pasted or picked files into the chat's folder. */
export const addAttachments = async (
  sessionId: string,
  files: { name: string; bytes: Uint8Array }[]
): Promise<AttachmentAddResult> => {
  const directory = ensureAttachmentsDir(sessionId)
  const added: ChatAttachment[] = []
  const errors: { name: string; error: string }[] = []

  // The image cap counts what is already in the folder, not just this batch.
  let imageCount = listAttachments(sessionId).files.filter((file) => file.kind === 'image').length

  for (const file of files) {
    try {
      const buffer = Buffer.from(file.bytes)

      if (isImageExtension(file.name)) {
        const problem = validateImageBytes(file.name, buffer, imageCount)
        if (problem) throw new Error(problem)
        imageCount++
      }

      const safeName = uniqueNameIn(directory, sanitizeAttachmentName(file.name))
      const target = resolveInside(directory, safeName)
      await fs.promises.writeFile(target, buffer)

      added.push(toAttachment(directory, safeName, await fs.promises.stat(target)))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('Failed to save attachment', { sessionId, name: file.name, error: message })
      errors.push({ name: file.name, error: message })
    }
  }

  return { ...listAttachments(sessionId), added, errors }
}

/** Copy files the user picked with the native dialog, leaving the originals alone. */
export const addAttachmentsFromPaths = async (
  sessionId: string,
  sourcePaths: string[]
): Promise<AttachmentAddResult> => {
  const files: { name: string; bytes: Uint8Array }[] = []
  const readErrors: { name: string; error: string }[] = []

  for (const source of sourcePaths) {
    try {
      files.push({ name: path.basename(source), bytes: await fs.promises.readFile(source) })
    } catch (error) {
      readErrors.push({
        name: path.basename(source),
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const result = await addAttachments(sessionId, files)
  return { ...result, errors: [...readErrors, ...result.errors] }
}

/** Hard-delete one attached file. */
export const removeAttachment = async (
  sessionId: string,
  name: string
): Promise<AttachmentRemoveResult> => {
  const directory = resolveAttachmentsDir(sessionId)
  const target = resolveInside(directory, name)

  let removed = false
  if (fs.existsSync(target)) {
    await fs.promises.unlink(target)
    removed = true
    logger.info('Attachment deleted', { sessionId, name })
  }

  return { ...listAttachments(sessionId), removed }
}

/** Explicit rename hook for the title-change path. */
export const renameAttachmentsDir = (
  sessionId: string
): { renamed: boolean; directory?: string } => {
  let before: string | undefined
  try {
    before = findChatFolderByShortId(getAttachmentsRoot(), sessionId)
  } catch {
    return { renamed: false }
  }

  if (!before) return { renamed: false }

  const after = resolveAttachmentsDir(sessionId)
  return { renamed: path.resolve(after) !== path.resolve(before), directory: after }
}

/** Delete a chat's attachments folder, used when the chat itself is deleted. */
export const removeAllAttachments = (sessionId: string): { removed: boolean } => {
  let directory: string | undefined
  try {
    directory = findChatFolderByShortId(getAttachmentsRoot(), sessionId)
  } catch {
    return { removed: false }
  }

  if (!directory || !fs.existsSync(directory)) return { removed: false }

  fs.rmSync(directory, { recursive: true, force: true })
  logger.info('Attachments folder removed with its chat', {
    sessionId,
    directory: path.basename(directory)
  })
  return { removed: true }
}

/**
 * Delete every attachments folder.
 *
 * "Delete all chats" has to reach folders belonging to chats the sidebar hides, so this works
 * off the folders on disk rather than a list of session ids.
 */
export const removeEveryAttachmentsFolder = (): { removed: number } => {
  let root: string
  try {
    root = getAttachmentsRoot()
  } catch {
    return { removed: 0 }
  }

  if (!fs.existsSync(root)) return { removed: 0 }

  let removed = 0
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    fs.rmSync(path.join(root, entry.name), { recursive: true, force: true })
    removed++
  }

  logger.info('All attachments folders removed', { removed })
  return { removed }
}
