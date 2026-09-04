/**
 * Chat attachments: one folder per chat under the project directory, named after the chat.
 *
 * Files are written the moment they are dropped, pasted or picked, and their contents are
 * rebuilt into request context on every send rather than being pasted into the message.
 */

export {
  addAttachments,
  addAttachmentsFromPaths,
  ensureAttachmentsDir,
  getAttachmentsRoot,
  listAttachments,
  removeAllAttachments,
  removeAttachment,
  removeEveryAttachmentsFolder,
  renameAttachmentsDir,
  resolveAttachmentsDir
} from './attachmentsManager'

export { buildAttachmentContext } from './attachmentContext'

export type {
  AttachmentAddResult,
  AttachmentContextResult,
  AttachmentKind,
  AttachmentListing,
  AttachmentRemoveResult,
  ChatAttachment
} from './types'
