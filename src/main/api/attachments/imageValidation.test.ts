import {
  isImageExtension,
  readImageDimensions,
  toBedrockImageFormat,
  validateImageBytes
} from './imageValidation'
import { MAX_IMAGE_BYTES, MAX_IMAGES } from './types'

/** Minimal 8-byte PNG signature followed by an IHDR chunk carrying the size. */
const pngHeader = (width: number, height: number): Buffer => {
  const buffer = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0)
  buffer.write('IHDR', 12, 'latin1')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

const gifHeader = (width: number, height: number): Buffer => {
  const buffer = Buffer.alloc(10)
  buffer.write('GIF89a', 0, 'latin1')
  buffer.writeUInt16LE(width, 6)
  buffer.writeUInt16LE(height, 8)
  return buffer
}

/** JPEG with one APP0 segment before the SOF0 that carries the size. */
const jpegHeader = (width: number, height: number): Buffer => {
  const buffer = Buffer.alloc(40)
  buffer.writeUInt16BE(0xffd8, 0) // SOI
  buffer.writeUInt16BE(0xffe0, 2) // APP0
  buffer.writeUInt16BE(6, 4) // segment length
  buffer.writeUInt16BE(0xffc0, 10) // SOF0
  buffer.writeUInt16BE(11, 12) // segment length
  buffer.writeUInt8(8, 14) // precision
  buffer.writeUInt16BE(height, 15)
  buffer.writeUInt16BE(width, 17)
  return buffer
}

const webpVp8xHeader = (width: number, height: number): Buffer => {
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'latin1')
  buffer.write('WEBP', 8, 'latin1')
  buffer.write('VP8X', 12, 'latin1')
  buffer.writeUIntLE(width - 1, 24, 3)
  buffer.writeUIntLE(height - 1, 27, 3)
  return buffer
}

describe('readImageDimensions', () => {
  it('reads a PNG header', () => {
    expect(readImageDimensions(pngHeader(1200, 800))).toEqual({ width: 1200, height: 800 })
  })

  it('reads a GIF header', () => {
    expect(readImageDimensions(gifHeader(64, 48))).toEqual({ width: 64, height: 48 })
  })

  it('reads a JPEG start-of-frame past an earlier segment', () => {
    expect(readImageDimensions(jpegHeader(4032, 3024))).toEqual({ width: 4032, height: 3024 })
  })

  it('reads a WebP VP8X canvas size', () => {
    expect(readImageDimensions(webpVp8xHeader(900, 700))).toEqual({ width: 900, height: 700 })
  })

  it('returns undefined for an unrecognized or truncated header', () => {
    expect(readImageDimensions(Buffer.from('not an image'))).toBeUndefined()
    expect(readImageDimensions(pngHeader(10, 10).subarray(0, 12))).toBeUndefined()
  })
})

describe('toBedrockImageFormat', () => {
  it('maps .jpg to jpeg, which is the name Bedrock accepts', () => {
    expect(toBedrockImageFormat('photo.jpg')).toBe('jpeg')
    expect(toBedrockImageFormat('photo.JPEG')).toBe('jpeg')
  })

  it('maps the remaining supported formats', () => {
    expect(toBedrockImageFormat('a.png')).toBe('png')
    expect(toBedrockImageFormat('a.gif')).toBe('gif')
    expect(toBedrockImageFormat('a.webp')).toBe('webp')
  })

  it('returns undefined for anything else', () => {
    expect(toBedrockImageFormat('a.bmp')).toBeUndefined()
    expect(toBedrockImageFormat('a.pdf')).toBeUndefined()
  })
})

describe('isImageExtension', () => {
  it('recognizes images case-insensitively', () => {
    expect(isImageExtension('shot.PNG')).toBe(true)
    expect(isImageExtension('notes.txt')).toBe(false)
  })
})

describe('validateImageBytes', () => {
  it('accepts an image within every limit', () => {
    expect(validateImageBytes('a.png', pngHeader(100, 100), 0)).toBeUndefined()
  })

  it('rejects an unsupported format', () => {
    expect(validateImageBytes('a.bmp', pngHeader(10, 10), 0)).toMatch(/Unsupported image format/)
  })

  it('rejects bytes over the size limit', () => {
    const big = Buffer.concat([pngHeader(10, 10), Buffer.alloc(MAX_IMAGE_BYTES)])
    expect(validateImageBytes('a.png', big, 0)).toMatch(/3.75 MB/)
  })

  it('rejects an image that is too many pixels on a side', () => {
    expect(validateImageBytes('a.png', pngHeader(9000, 100), 0)).toMatch(/9000x100/)
  })

  it('rejects the image past the per-request cap', () => {
    expect(validateImageBytes('a.png', pngHeader(10, 10), MAX_IMAGES)).toMatch(/maximum of 20/)
  })

  it('does not reject an image whose header it cannot read', () => {
    expect(validateImageBytes('a.png', Buffer.from('truncated'), 0)).toBeUndefined()
  })
})
