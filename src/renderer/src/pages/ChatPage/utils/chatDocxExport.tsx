import { renderToStaticMarkup } from 'react-dom/server'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { LiaUserCircleSolid } from 'react-icons/lia'
import { IdentifiableMessage } from '@/types/chat/message'
import { getModelIcon } from '@renderer/components/ModelIcon'
import AILogo from '@renderer/assets/images/icons/bedrock-color.png'
import {
  buildChatSections,
  svgToPngDataUrl,
  type ChatExportImage,
  type DrawioRasterizer
} from './chatExport'

/** Context needed to reproduce each message's chat avatar as an image. */
export interface AvatarContext {
  /** Emoji chosen for the user avatar (empty = default user icon). */
  userEmoji?: string
  /** Resolve a modelId to its display info, mirroring the chat Avatar. */
  resolveModel: (
    modelId?: string
  ) => { modelName?: string; isInferenceProfile?: boolean } | undefined
}

export interface BuildChatHtmlOptions {
  rasterizeDrawio?: DrawioRasterizer
  /** Role heading text per message (e.g. `Assistant (Claude Opus 5)`). */
  roleLabel: (message: IdentifiableMessage) => string
  /** When provided, each turn's chat avatar is embedded next to its heading. */
  avatar?: AvatarContext
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch])
}

/**
 * Pixel size that avatar images are baked to. The size MUST live in the PNG itself:
 * html-to-docx emits an empty (invalid) `<wp:extent>` for an <img> inside a heading when
 * the tag carries any width/height/style attribute, so the avatar <img> is rendered bare and
 * Word derives its size from the image's intrinsic dimensions. html-to-docx maps pixels to
 * EMU at 96 dpi (px * 9525), so 19px ≈ 0.20" — the desired on-page avatar size.
 */
const AVATAR_PX = 19

/**
 * Horizontal rule between messages. html-to-docx ignores `<hr>` and CSS borders on
 * paragraphs/divs, so a full-width single-cell table with borders disabled except the cell's
 * bottom edge renders as a clean horizontal line (no surrounding box).
 */
const MESSAGE_RULE =
  '<table style="border:none;width:100%"><tbody><tr>' +
  '<td style="border:none;border-bottom:1px solid #cccccc"></td>' +
  '</tr></tbody></table>'

/**
 * Build a self-contained HTML document for a chat session, suitable for handing to a
 * markdown/HTML→docx writer. Role headings are constructed directly (so headings inside
 * message bodies don't interfere), body images/diagrams are inlined as data URLs, and each
 * turn's chat avatar is embedded beside its heading.
 */
export async function buildChatHtml(
  title: string,
  messages: IdentifiableMessage[],
  options: BuildChatHtmlOptions
): Promise<{ html: string }> {
  const { sections, images } = await buildChatSections(messages, {
    rasterizeDrawio: options.rasterizeDrawio
  })

  const imageMap = new Map(images.map((img: ChatExportImage) => [img.filename, img.base64]))

  // Rasterize each turn's avatar up front (avatarDataUrl is async).
  const avatarUrls = await Promise.all(
    sections.map(({ message }) =>
      options.avatar ? avatarDataUrl(message, options.avatar) : Promise.resolve(null)
    )
  )

  const parts: string[] = [`<h1>${escapeHtml(title)}</h1>`]

  sections.forEach(({ message, body }, index) => {
    const label = options.roleLabel(message)
    const avatar = avatarUrls[index]
    // The <img> must be a bare direct child of the heading (src only, no width/height/style,
    // not wrapped in a span): html-to-docx otherwise emits an invalid empty extent for an
    // image inside a heading. The size is baked into the PNG (AVATAR_PX) instead.
    const avatarImg = avatar ? `<img src="${avatar}" />&nbsp;` : ''

    const bodyHtml = inlineImages(
      renderToStaticMarkup(<Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>),
      imageMap
    )

    // A horizontal rule separates consecutive messages.
    if (index > 0) parts.push(MESSAGE_RULE)
    parts.push(`<h2 style="font-size:14pt">${avatarImg}${escapeHtml(label)}</h2>`, bodyHtml)
  })

  return { html: parts.join('\n') }
}

/** Rewrite `src="images/<filename>"` refs to inline base64 data URLs. */
function inlineImages(html: string, imageMap: Map<string, string>): string {
  return html.replace(/src="images\/([^"]+)"/g, (whole, rawName: string) => {
    const filename = decodeURIComponent(rawName)
    const base64 = imageMap.get(filename) ?? imageMap.get(rawName)
    return base64 ? `src="data:image/png;base64,${base64}"` : whole
  })
}

/**
 * Produce a PNG data URL for a message's chat avatar, mirroring
 * `MessageList/Avatar.tsx`. Returns null on failure (the heading then renders without an
 * avatar image).
 */
export async function avatarDataUrl(
  message: IdentifiableMessage,
  ctx: AvatarContext
): Promise<string | null> {
  try {
    let raw: string | null
    if (message.role === 'assistant') {
      const modelId = message.metadata?.modelId
      if (modelId) {
        const model = ctx.resolveModel(modelId)
        raw = await svgToPngDataUrl(
          normalizeSvgSize(renderToStaticMarkup(getModelIcon(modelId, model?.isInferenceProfile)))
        )
      } else {
        // No modelId → the generic Bedrock logo (a bundled PNG).
        raw = await loadImageDataUrl(AILogo)
      }
    } else if (ctx.userEmoji) {
      raw = emojiToPngDataUrl(ctx.userEmoji)
    } else {
      raw = await svgToPngDataUrl(normalizeSvgSize(renderToStaticMarkup(<LiaUserCircleSolid />)))
    }

    // Bake all avatars to a uniform square size so they render consistently and carry their
    // dimensions intrinsically (no width/height attributes — see AVATAR_PX).
    return raw ? await normalizeToSquarePng(raw, AVATAR_PX) : null
  } catch (error) {
    console.error('Failed to rasterize avatar for docx export:', error)
    return null
  }
}

/**
 * Strip the `width`/`height` attributes from an `<svg>` opening tag so
 * {@link svgToPngDataUrl} sizes from the viewBox. react-icons emit `width="1em"` which
 * otherwise rasterizes to a 1px image.
 */
function normalizeSvgSize(svg: string): string {
  return svg.replace(/<svg\b[^>]*>/i, (tag) => tag.replace(/\s(width|height)="[^"]*"/gi, ''))
}

/** Draw a source image (data URL) centered on a fixed square canvas → PNG data URL. */
function normalizeToSquarePng(srcDataUrl: string, size: number): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(null)
        return
      }
      const srcW = img.naturalWidth || size
      const srcH = img.naturalHeight || size
      const scale = Math.min(size / srcW, size / srcH)
      const w = srcW * scale
      const h = srcH * scale
      context.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = srcDataUrl
  })
}

/** Load an image URL and return it as a PNG data URL (no resizing). */
function loadImageDataUrl(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth || 64
      canvas.height = img.naturalHeight || 64
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(null)
        return
      }
      context.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/** Render an emoji glyph onto a small canvas and return a PNG data URL. */
function emojiToPngDataUrl(emoji: string): string | null {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) return null
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `${Math.round(size * 0.8)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
  context.fillText(emoji, size / 2, size / 2 + 2)
  return canvas.toDataURL('image/png')
}
