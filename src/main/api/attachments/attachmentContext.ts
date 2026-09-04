import fs from 'fs'
import { createCategoryLogger } from '../../../common/logger'
import { extractDocxText } from '../../handlers/docx-handlers'
import { extractPdfText } from '../../handlers/pdf-handlers'
import { listAttachments } from './attachmentsManager'
import { toBedrockImageFormat, validateImageBytes } from './imageValidation'
import {
  AttachmentContextResult,
  ChatAttachment,
  MAX_TEXT_CHARS_PER_FILE,
  MAX_TEXT_CHARS_TOTAL
} from './types'

const logger = createCategoryLogger('attachments:context')

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * A file with a text extension can still hold binary data (a `.txt` that is really gzip).
 * Inlining that produces replacement characters, so it is treated as non-extractable.
 */
const looksBinary = (buffer: Buffer): boolean => buffer.subarray(0, 8192).includes(0)

const readExtractedText = async (file: ChatAttachment): Promise<string> => {
  if (file.kind === 'pdf') return extractPdfText(file.path)
  if (file.kind === 'docx') return extractDocxText(file.path)

  const buffer = await fs.promises.readFile(file.path)
  if (looksBinary(buffer)) {
    throw new Error('File contains binary data, so its text was not inlined.')
  }
  return buffer.toString('utf-8')
}

/**
 * Rebuild the attachment context from what is on disk right now.
 *
 * Called once per user send, so edits and deletions made since the last message are picked up
 * without re-extracting on every request of a turn.
 */
export const buildAttachmentContext = async (
  sessionId: string
): Promise<AttachmentContextResult> => {
  const { directory, files } = listAttachments(sessionId)

  const empty: AttachmentContextResult = {
    directory,
    blocks: [],
    fileCount: 0,
    imageCount: 0,
    totalTextChars: 0,
    truncatedFiles: [],
    skippedFiles: []
  }
  if (files.length === 0) return empty

  const truncatedFiles: string[] = []
  const skippedFiles: { name: string; reason: string }[] = []
  const lines: string[] = []
  let totalTextChars = 0

  for (const file of files) {
    if (file.kind === 'image') continue

    const attributes = `name="${file.name}" path="${file.path}" size="${formatSize(file.size)}"`

    if (!file.extractable) {
      lines.push(
        `<file ${attributes} content="not-extracted" note="Not a text format. Inspect it with a tool if you need its contents."/>`
      )
      continue
    }

    if (file.size === 0) {
      lines.push(`<file ${attributes} content="empty"/>`)
      continue
    }

    if (totalTextChars >= MAX_TEXT_CHARS_TOTAL) {
      lines.push(
        `<file ${attributes} content="not-included" note="The attachment text budget for this message was already full. Read it with readFiles."/>`
      )
      truncatedFiles.push(file.name)
      continue
    }

    try {
      const text = await readExtractedText(file)
      const budget = Math.min(MAX_TEXT_CHARS_PER_FILE, MAX_TEXT_CHARS_TOTAL - totalTextChars)
      const included = text.slice(0, budget)
      totalTextChars += included.length

      const suffix =
        included.length < text.length
          ? `\n… [truncated: first ${included.length.toLocaleString()} of ${text.length.toLocaleString()} characters. Use readFiles with a line range for the rest.]`
          : ''
      if (suffix) truncatedFiles.push(file.name)

      lines.push(`<file ${attributes}>\n${included}${suffix}\n</file>`)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      logger.warn('Could not inline an attachment', { sessionId, name: file.name, error: reason })
      lines.push(`<file ${attributes} content="not-extracted" note="${reason}"/>`)
      skippedFiles.push({ name: file.name, reason })
    }
  }

  const blocks: unknown[] = [
    {
      text: [
        `<chat_attachments folder="${directory}" count="${files.length}">`,
        'Files the user attached to this chat. They are real files on disk — re-read them at any',
        'time with readFiles; the folder path above is stable for this chat.',
        '',
        ...lines,
        '</chat_attachments>'
      ].join('\n')
    }
  ]

  // Images travel as their own content blocks. They are re-validated here because a file can be
  // replaced on disk after it was attached.
  let imageCount = 0
  for (const file of files) {
    if (file.kind !== 'image') continue

    const format = toBedrockImageFormat(file.name)
    if (!format) {
      skippedFiles.push({ name: file.name, reason: 'Unsupported image format' })
      continue
    }

    try {
      const bytes = await fs.promises.readFile(file.path)
      const problem = validateImageBytes(file.name, bytes, imageCount)
      if (problem) {
        skippedFiles.push({ name: file.name, reason: problem })
        continue
      }

      blocks.push({ text: `Attached image: ${file.name} (${file.path})` })
      blocks.push({ image: { format, source: { bytes: bytes.toString('base64') } } })
      imageCount++
    } catch (error) {
      skippedFiles.push({
        name: file.name,
        reason: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return {
    directory,
    blocks,
    fileCount: files.length,
    imageCount,
    totalTextChars,
    truncatedFiles,
    skippedFiles
  }
}
