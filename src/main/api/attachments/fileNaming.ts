import fs from 'fs'
import path from 'path'
import { isInside } from '../../lib/pathSafety'

/** Characters that are reserved on at least one platform. */
const RESERVED_NAME_CHARS = /[/\\:*?"<>|]/g

/** Control characters are dropped by code point, which keeps this regex-escape free. */
const stripControlChars = (value: string): string =>
  [...value].filter((char) => char.codePointAt(0)! > 0x1f).join('')

/**
 * Filesystem-safe attachment name.
 *
 * Unicode letters are kept: the attachments folder is something the user browses, so a name
 * like `仕様書.pdf` has to survive rather than collapse to `_.pdf`. Only characters that are
 * actually reserved on some platform, control characters, and path separators are removed.
 */
export const sanitizeAttachmentName = (fileName: string): string => {
  const base = stripControlChars(path.basename(fileName || '').replace(RESERVED_NAME_CHARS, ''))
    .replace(/\s+/g, ' ')
    .trim()
    // Leading dots would hide the file; trailing dots are invalid on Windows.
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')

  if (!base) return 'attachment'

  const ext = path.extname(base)
  const stem = path.basename(base, ext).slice(0, 100) || 'attachment'
  return `${stem}${ext}`
}

/** Avoid clobbering an existing file by adding a numeric suffix. */
export const uniqueNameIn = (directory: string, fileName: string): string => {
  const ext = path.extname(fileName)
  const stem = path.basename(fileName, ext)

  let candidate = fileName
  let count = 1
  while (fs.existsSync(path.join(directory, candidate))) {
    candidate = `${stem}-${count}${ext}`
    count++
  }
  return candidate
}

/**
 * Absolute path of a direct child of `directory`, refusing anything that would reach outside
 * it — including the folder itself, nested paths and absolute paths.
 */
export const resolveInside = (directory: string, name: string): string => {
  if (!name || name !== path.basename(name)) {
    throw new Error(`Invalid attachment name: "${name}"`)
  }

  const parent = path.resolve(directory)
  const target = path.resolve(parent, name)
  const relative = path.relative(parent, target)

  if (!isInside(target, parent) || relative === '' || relative.includes(path.sep)) {
    throw new Error(`Attachment name "${name}" resolves outside the chat's attachments folder.`)
  }
  return target
}
