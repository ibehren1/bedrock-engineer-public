import path from 'path'
import { IMAGE_EXTENSIONS, MAX_IMAGE_BYTES, MAX_IMAGE_DIMENSION, MAX_IMAGES } from './types'

export type BedrockImageFormat = 'png' | 'jpeg' | 'gif' | 'webp'

export const isImageExtension = (fileName: string): boolean =>
  IMAGE_EXTENSIONS.includes(path.extname(fileName).toLowerCase())

/**
 * Bedrock's image format names, which are not simply the file extension: a `.jpg` file must
 * be declared as `jpeg` or the request is rejected.
 */
export const toBedrockImageFormat = (fileName: string): BedrockImageFormat | undefined => {
  switch (path.extname(fileName).toLowerCase()) {
    case '.png':
      return 'png'
    case '.jpg':
    case '.jpeg':
      return 'jpeg'
    case '.gif':
      return 'gif'
    case '.webp':
      return 'webp'
    default:
      return undefined
  }
}

/**
 * Read pixel dimensions out of the file header for the four formats Bedrock accepts.
 *
 * This replaces the renderer's `new Image()` decode so drop, paste and the native picker all
 * validate in one place. Returns undefined for an unrecognized or truncated header, in which
 * case callers skip the dimension check rather than reject the file — Electron's `nativeImage`
 * was not used because it does not decode GIF or WebP.
 */
export const readImageDimensions = (
  buffer: Buffer
): { width: number; height: number } | undefined => {
  // PNG: 8-byte signature, then an IHDR chunk whose data starts at byte 16.
  if (
    buffer.length >= 24 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }

  // GIF: "GIF87a"/"GIF89a" then the logical screen descriptor, little endian.
  if (buffer.length >= 10 && buffer.subarray(0, 3).toString('latin1') === 'GIF') {
    return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) }
  }

  // WebP: RIFF container; VP8X, VP8 (lossy) and VP8L (lossless) each store size differently.
  if (
    buffer.length >= 30 &&
    buffer.subarray(0, 4).toString('latin1') === 'RIFF' &&
    buffer.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    const chunk = buffer.subarray(12, 16).toString('latin1')
    if (chunk === 'VP8X') {
      // 24-bit little-endian canvas size minus one.
      const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16))
      const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16))
      return { width, height }
    }
    if (chunk === 'VP8 ' && buffer.length >= 30) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff }
    }
    if (chunk === 'VP8L' && buffer.length >= 25) {
      const bits = buffer.readUInt32LE(21)
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) }
    }
    return undefined
  }

  // JPEG: scan the marker segments for a start-of-frame, which carries the dimensions.
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset++
        continue
      }
      const marker = buffer[offset + 1]
      // SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15 all carry height/width at the same offset.
      const isStartOfFrame =
        marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isStartOfFrame) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) }
      }
      const segmentLength = buffer.readUInt16BE(offset + 2)
      if (segmentLength <= 0) return undefined
      offset += 2 + segmentLength
    }
  }

  return undefined
}

/**
 * Validate image bytes against Bedrock's limits.
 * @returns an error message, or undefined when the bytes are acceptable
 */
export const validateImageBytes = (
  fileName: string,
  bytes: Buffer,
  existingImageCount: number
): string | undefined => {
  if (!toBedrockImageFormat(fileName)) {
    return `Unsupported image format: ${path.extname(fileName) || 'unknown'}`
  }
  if (existingImageCount >= MAX_IMAGES) {
    return `This chat already has the maximum of ${MAX_IMAGES} images attached.`
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return 'Image is larger than the 3.75 MB limit Bedrock accepts.'
  }

  const dimensions = readImageDimensions(bytes)
  if (
    dimensions &&
    (dimensions.width > MAX_IMAGE_DIMENSION || dimensions.height > MAX_IMAGE_DIMENSION)
  ) {
    return `Image is larger than ${MAX_IMAGE_DIMENSION}px on a side (${dimensions.width}x${dimensions.height}).`
  }
  return undefined
}
