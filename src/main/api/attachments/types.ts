/**
 * Types and limits for chat attachments.
 *
 * Attachments are real files on disk, one folder per chat, under the project directory —
 * the same shape as Docker sandboxes. The folder's contents are rebuilt into request
 * context on every send, so the caps here bound how much of it can reach the model.
 */

/** Folder under the project directory that holds every chat's attachments folder. */
export const ATTACHMENTS_ROOT_DIRNAME = 'attachments'

/** How a file is treated when the request context is assembled. */
export type AttachmentKind = 'image' | 'text' | 'pdf' | 'docx' | 'other'

export interface ChatAttachment {
  /** File name inside the chat's attachments folder. */
  name: string
  /** Absolute path, so the agent can also reach the file with its filesystem tools. */
  path: string
  size: number
  mtime: number
  kind: AttachmentKind
  /** Whether the file's text is inlined into the injected context. */
  extractable: boolean
}

export interface AttachmentListing {
  directory: string
  files: ChatAttachment[]
}

export interface AttachmentAddResult extends AttachmentListing {
  added: ChatAttachment[]
  errors: { name: string; error: string }[]
}

export interface AttachmentRemoveResult extends AttachmentListing {
  removed: boolean
}

export interface AttachmentContextResult {
  directory: string
  /** Bedrock `ContentBlock[]`, typed loosely here so main stays free of SDK types. */
  blocks: unknown[]
  fileCount: number
  imageCount: number
  totalTextChars: number
  truncatedFiles: string[]
  skippedFiles: { name: string; reason: string }[]
}

/** Bedrock Converse image limits, previously enforced in the renderer. */
export const MAX_IMAGE_BYTES = 3.75 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 8000
export const MAX_IMAGES = 20

/** Image formats Bedrock accepts as image content blocks. */
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

/** Injected-text budget, per file and across the whole folder. */
export const MAX_TEXT_CHARS_PER_FILE = 120_000
export const MAX_TEXT_CHARS_TOTAL = 480_000

/**
 * Extensions whose text is extracted inline. Anything else is attached and listed, but
 * reaches the model as a path only.
 *
 * Spreadsheets are deliberately absent: nothing in the app parses them, so reading one as
 * UTF-8 would inject binary noise.
 */
export const EXTRACTABLE_TEXT_EXTENSIONS = [
  // Documents
  '.pdf',
  '.docx',
  // Plain text / data
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.htm',
  '.log',
  // Code / config
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.java',
  '.go',
  '.rs',
  '.c',
  '.cpp',
  '.sh',
  '.sql',
  '.toml',
  '.ini',
  '.env',
  '.cfg',
  '.tf',
  '.hcl'
]
