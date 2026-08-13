import mermaid from 'mermaid'
import { IdentifiableMessage } from '@/types/chat/message'
import { extractDrawioXml, isDrawioXml } from '@renderer/lib/drawio/xmlParser'

/**
 * A rendered image to be written alongside the exported markdown file.
 * `base64` is the raw base64 payload (without the data URL prefix).
 */
export interface ChatExportImage {
  filename: string
  base64: string
}

export interface ChatExportResult {
  markdown: string
  images: ChatExportImage[]
}

/** Optional rasterizer for DrawIO XML. Returns a PNG data URL, or null on failure. */
export type DrawioRasterizer = (xml: string) => Promise<string | null>

const FENCE_RE = /```([^\n`]*)\n([\s\S]*?)```/g
const MXFILE_RE = /<mxfile[\s\S]*?<\/mxfile>/gi

/**
 * Build a standard CommonMark document from a chat session.
 *
 * Only user prompts and assistant answers are included (text + image content
 * blocks). Tool calls, tool results, reasoning, and metadata are intentionally
 * excluded. Mermaid diagrams, DrawIO diagrams, and embedded images are
 * rasterized to PNG and referenced via relative `images/` links.
 */
export async function buildChatMarkdown(
  title: string,
  messages: IdentifiableMessage[],
  options: { rasterizeDrawio?: DrawioRasterizer } = {}
): Promise<ChatExportResult> {
  const images: ChatExportImage[] = []
  let diagramCount = 0
  let imageCount = 0

  const pushImage = (dataUrl: string, prefix: 'diagram' | 'image'): string => {
    const base64 = stripDataUrlPrefix(dataUrl)
    if (!base64) return ''
    const filename =
      prefix === 'diagram' ? `diagram-${++diagramCount}.png` : `image-${++imageCount}.png`
    images.push({ filename, base64 })
    return `![${prefix}](images/${filename})`
  }

  const sections: string[] = [`# ${title}`, '']

  for (const message of messages) {
    const role = message.role === 'assistant' ? 'Assistant' : 'User'
    const blocks = message.content ?? []

    const rendered: string[] = []
    for (const block of blocks) {
      if (block && 'text' in block && block.text) {
        rendered.push(await processText(block.text, pushImage, options.rasterizeDrawio))
      } else if (block && 'image' in block && block.image) {
        const dataUrl = await imageBlockToPngDataUrl(block.image)
        if (dataUrl) {
          rendered.push(pushImage(dataUrl, 'image'))
        }
      }
      // All other block types (toolUse, toolResult, reasoningContent, ...) are skipped.
    }

    const body = rendered.join('\n\n').trim()
    if (!body) continue

    sections.push(`## ${role}`, '', body, '')
  }

  return { markdown: sections.join('\n').trim() + '\n', images }
}

/**
 * Process a single text block: rasterize any mermaid / DrawIO fenced blocks (and
 * bare `<mxfile>` XML) into PNG image references, leaving all other markdown
 * untouched so it remains portable.
 */
async function processText(
  text: string,
  pushImage: (dataUrl: string, prefix: 'diagram' | 'image') => string,
  rasterizeDrawio?: DrawioRasterizer
): Promise<string> {
  // Pass 1: fenced code blocks
  let out = ''
  let lastIndex = 0
  let match: RegExpExecArray | null
  FENCE_RE.lastIndex = 0
  while ((match = FENCE_RE.exec(text)) !== null) {
    out += text.slice(lastIndex, match.index)
    const lang = match[1].trim().toLowerCase()
    const code = match[2]
    const original = match[0]

    if (lang === 'mermaid') {
      const dataUrl = await rasterizeMermaid(code)
      out += dataUrl ? pushImage(dataUrl, 'diagram') : original
    } else if (lang === 'xml' || lang === 'drawio' || (lang === '' && isDrawioXml(code))) {
      const xml = extractDrawioXml(code)
      const dataUrl = xml && rasterizeDrawio ? await rasterizeDrawio(xml) : null
      out += dataUrl ? pushImage(dataUrl, 'diagram') : original
    } else {
      out += original
    }

    lastIndex = match.index + original.length
  }
  out += text.slice(lastIndex)

  // Pass 2: bare <mxfile> XML outside of code fences
  if (rasterizeDrawio && MXFILE_RE.test(out)) {
    out = await replaceAsync(out, MXFILE_RE, async (xmlMatch) => {
      const xml = extractDrawioXml(xmlMatch)
      const dataUrl = xml ? await rasterizeDrawio(xml) : null
      return dataUrl ? pushImage(dataUrl, 'diagram') : xmlMatch
    })
  }

  return out
}

/** Render mermaid source to a high-resolution PNG data URL. */
async function rasterizeMermaid(code: string): Promise<string | null> {
  try {
    const { svg } = await mermaid.render(`export-${crypto.randomUUID()}`, code)
    return await svgToPngDataUrl(svg)
  } catch (error) {
    console.error('Failed to rasterize mermaid diagram for export:', error)
    return null
  }
}

/** Convert an SVG string to a white-background PNG data URL (3x resolution). */
function svgToPngDataUrl(svg: string, scale = 3): Promise<string | null> {
  return new Promise((resolve) => {
    let width = 800
    let height = 600

    try {
      const svgElement = new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('svg')
      if (svgElement) {
        const svgWidth = svgElement.getAttribute('width')
        const svgHeight = svgElement.getAttribute('height')
        if (svgWidth && svgHeight) {
          width = parseFloat(svgWidth.replace('px', '')) || width
          height = parseFloat(svgHeight.replace('px', '')) || height
        } else {
          const viewBox = svgElement.getAttribute('viewBox')
          if (viewBox) {
            const [, , vbWidth, vbHeight] = viewBox.split(/\s+/).map(Number)
            width = vbWidth || width
            height = vbHeight || height
          }
        }
      }
    } catch {
      // Fall back to default dimensions
    }

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      canvas.width = width * scale
      canvas.height = height * scale
      if (ctx) {
        ctx.scale(scale, scale)
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, width, height)
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, width, height)
      }
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
  })
}

/** Re-encode an embedded message image (any format) to a PNG data URL. */
function imageBlockToPngDataUrl(image: {
  format?: string
  source?: { bytes?: unknown }
}): Promise<string | null> {
  const sourceUrl = imageDataToDataUrl(image.source?.bytes, image.format || 'png')
  if (!sourceUrl) return Promise.resolve(null)

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || img.width
      canvas.height = img.naturalHeight || img.height
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } else {
        resolve(sourceUrl)
      }
    }
    // If re-encoding fails, fall back to the original payload.
    img.onerror = () => resolve(sourceUrl)
    img.src = sourceUrl
  })
}

/** Convert various Bedrock image byte representations to a data URL. */
function imageDataToDataUrl(imageData: unknown, format: string): string | null {
  if (!imageData) return null

  if (typeof imageData === 'string') {
    return imageData.startsWith('data:') ? imageData : `data:image/${format};base64,${imageData}`
  }

  if (imageData instanceof Uint8Array) {
    let binary = ''
    for (let i = 0; i < imageData.length; i++) {
      binary += String.fromCharCode(imageData[i])
    }
    return `data:image/${format};base64,${btoa(binary)}`
  }

  if (typeof imageData === 'object' && imageData !== null && 'bytes' in imageData) {
    return imageDataToDataUrl((imageData as { bytes: unknown }).bytes, format)
  }

  return null
}

/** Strip a `data:...;base64,` prefix, returning the raw base64 payload. */
function stripDataUrlPrefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',')
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
}

/** Like String.prototype.replace, but supports an async replacer. */
async function replaceAsync(
  input: string,
  regex: RegExp,
  replacer: (match: string) => Promise<string>
): Promise<string> {
  const matches = [...input.matchAll(regex)]
  let result = ''
  let lastIndex = 0
  for (const match of matches) {
    const start = match.index ?? 0
    result += input.slice(lastIndex, start)
    result += await replacer(match[0])
    lastIndex = start + match[0].length
  }
  result += input.slice(lastIndex)
  return result
}
