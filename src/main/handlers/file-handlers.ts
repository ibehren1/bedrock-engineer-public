import { app, BrowserWindow, IpcMainInvokeEvent } from 'electron'
import { handleFileOpen } from '../../preload/file'
import fs from 'fs'
import path from 'path'
import HTMLtoDOCX from 'html-to-docx'
import JSZip from 'jszip'
import { log } from '../../common/logger'
import { store } from '../../preload/store'

/** 1 inch in TWIP (1/1440 inch), the unit html-to-docx takes for page margins. */
const INCH_IN_TWIP = 1440

/**
 * Page margins for the exported docx: 1 inch on all four sides. Every key must be supplied —
 * html-to-docx only fills in defaults for the keys present in this object, so omitting
 * `header`/`footer`/`gutter` would emit an incomplete `<w:pgMar>`. The header/footer offsets
 * keep the library's own defaults (0.5 inch); no header or footer is generated anyway.
 */
const DOCX_MARGINS = {
  top: INCH_IN_TWIP,
  right: INCH_IN_TWIP,
  bottom: INCH_IN_TWIP,
  left: INCH_IN_TWIP,
  header: 720,
  footer: 720,
  gutter: 0
}

/** Body font of the exported docx. html-to-docx would otherwise default to Times New Roman. */
const DOCX_FONT = 'Calibri'

/** Body (Normal) font size in HIP — half-points, so 20 = 10pt. */
const DOCX_BODY_FONT_SIZE_HIP = 20

/**
 * Heading sizes in HIP (half-points) for the exported docx: 18pt / 16pt / 14pt. html-to-docx
 * hardcodes 24/18/14pt into its `styles.xml` template with no option to override, so these are
 * patched in afterwards. H4-H6 keep the library's defaults (12pt, 10pt, 10pt), which already
 * sit below H3.
 */
const DOCX_HEADING_SIZES_HIP: Record<string, number> = {
  Heading1: 36,
  Heading2: 32,
  Heading3: 28
}

/**
 * Cell padding for exported tables in TWIP (1/20 pt): 1pt vertical, 4pt horizontal.
 * html-to-docx uses 4pt / 8pt, which is a lot of dead space on a one-line row.
 */
const DOCX_TABLE_CELL_MARGINS: Record<string, number> = {
  top: 20,
  bottom: 20,
  left: 80,
  right: 80
}

/** Height in TWIP (6pt) of the empty paragraph html-to-docx puts after each table. */
const DOCX_TABLE_SPACER_HEIGHT = 120

/** Page size of the PDF export, matching the docx export's U.S. Letter default. */
const PDF_PAGE_SIZE = 'Letter'

/** Page margins of the PDF export, in inches (the docx export uses 1" as well). */
const PDF_MARGIN_INCHES = 1

export const fileHandlers = {
  'open-file': async (_event: IpcMainInvokeEvent) => {
    return handleFileOpen({
      title: 'openFile...',
      properties: ['openFile']
    })
  },

  'open-directory': async (_event: IpcMainInvokeEvent) => {
    const path = await handleFileOpen({
      title: 'Select Directory',
      properties: ['openDirectory', 'createDirectory'],
      message: 'Select a directory for your project',
      buttonLabel: 'Select Directory'
    })

    // If path was selected and it differs from the current project path,
    // update the project path in store
    if (path) {
      if (path !== store.get('projectPath')) {
        store.set('projectPath', path)
        log.info('Project path changed', { newPath: path })
      }
    }

    return path
  },

  'get-local-image': async (_event: IpcMainInvokeEvent, filePath: string) => {
    try {
      const data = await fs.promises.readFile(filePath)
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
      const base64 = data.toString('base64')
      return `data:image/${ext};base64,${base64}`
    } catch (error) {
      log.error('Failed to read image', {
        path: filePath,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  },

  'read-project-ignore': async (
    _event: IpcMainInvokeEvent,
    { projectPath }: { projectPath: string }
  ) => {
    try {
      const ignoreFilePath = path.join(projectPath, '.bedrock-engineer', '.ignore')

      try {
        const content = await fs.promises.readFile(ignoreFilePath, 'utf-8')
        log.info('Project ignore file read successfully', { projectPath, ignoreFilePath })
        return { content, exists: true }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          // ファイルが存在しない場合は空の内容を返す
          log.info('Project ignore file does not exist', { projectPath, ignoreFilePath })
          return { content: '', exists: false }
        }
        throw error
      }
    } catch (error) {
      log.error('Failed to read project ignore file', {
        projectPath,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  },

  'write-project-ignore': async (
    _event: IpcMainInvokeEvent,
    { projectPath, content }: { projectPath: string; content: string }
  ) => {
    try {
      const bedrockEngineerDir = path.join(projectPath, '.bedrock-engineer')
      const ignoreFilePath = path.join(bedrockEngineerDir, '.ignore')

      // .bedrock-engineerディレクトリが存在しない場合は作成
      try {
        await fs.promises.access(bedrockEngineerDir)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          await fs.promises.mkdir(bedrockEngineerDir, { recursive: true })
          log.info('Created .bedrock-engineer directory', { bedrockEngineerDir })
        } else {
          throw error
        }
      }

      // .ignoreファイルを書き込み
      await fs.promises.writeFile(ignoreFilePath, content, 'utf-8')
      log.info('Project ignore file written successfully', { projectPath, ignoreFilePath })

      return { success: true }
    } catch (error) {
      log.error('Failed to write project ignore file', {
        projectPath,
        error: error instanceof Error ? error.message : String(error)
      })
      return { success: false }
    }
  },

  'save-website-content': async (
    _event: IpcMainInvokeEvent,
    {
      content,
      url,
      filename,
      directory,
      format
    }: {
      content: string
      url: string
      filename?: string
      directory?: string
      format: 'html' | 'txt'
    }
  ) => {
    try {
      // プロジェクトパスを取得
      const projectPath = store.get('projectPath') || process.cwd()

      // 保存先ディレクトリを決定
      const targetDirectory = directory
        ? path.resolve(directory)
        : path.join(projectPath, 'downloads')

      // ディレクトリが存在しない場合は作成
      try {
        await fs.promises.access(targetDirectory)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          await fs.promises.mkdir(targetDirectory, { recursive: true })
          log.info('Created downloads directory', { targetDirectory })
        } else {
          throw error
        }
      }

      // ファイル名の生成
      let finalFilename: string
      if (filename) {
        // 拡張子が指定されていない場合は追加
        const extension = format === 'html' ? '.html' : '.txt'
        finalFilename = filename.endsWith(extension) ? filename : filename + extension
      } else {
        // URLからドメイン名を抽出してファイル名を生成
        try {
          const urlObj = new URL(url)
          const domain = urlObj.hostname.replace(/^www\./, '')
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const extension = format === 'html' ? '.html' : '.txt'
          finalFilename = `${domain}_${timestamp}${extension}`
        } catch {
          // URLが無効な場合のフォールバック
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const extension = format === 'html' ? '.html' : '.txt'
          finalFilename = `website_${timestamp}${extension}`
        }
      }

      const filePath = path.join(targetDirectory, finalFilename)

      // ファイル名の重複を避ける
      let finalPath = filePath
      let counter = 1
      let fileExists = true
      while (fileExists) {
        try {
          await fs.promises.access(finalPath)
          // ファイルが存在する場合、番号を付けて再試行
          const extension = path.extname(finalFilename)
          const basename = path.basename(finalFilename, extension)
          const newFilename = `${basename}_${counter}${extension}`
          finalPath = path.join(targetDirectory, newFilename)
          counter++
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            // ファイルが存在しない場合は使用可能
            fileExists = false
          } else {
            throw error
          }
        }
      }

      // ファイルを保存
      await fs.promises.writeFile(finalPath, content, 'utf-8')

      log.info('Website content saved successfully', {
        url,
        filePath: finalPath,
        format,
        fileSize: content.length
      })

      return {
        success: true,
        filePath: finalPath
      }
    } catch (error) {
      log.error('Failed to save website content', {
        url,
        filename,
        directory,
        format,
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },

  'save-chat-to-markdown': async (
    _event: IpcMainInvokeEvent,
    {
      title,
      markdown,
      images
    }: {
      title: string
      markdown: string
      images: { filename: string; base64: string }[]
    }
  ) => {
    try {
      // プロジェクトパスを取得（未設定時はカレントディレクトリ）
      const projectPath = store.get('projectPath') || process.cwd()

      // タイトルをファイルシステムで安全な名前に変換
      const safeTitle = sanitizeForFilesystem(title) || 'chat-export'

      // 出力先: <projectPath>/<title>/ と画像用の images/ サブディレクトリ
      const exportDir = path.join(projectPath, safeTitle)
      const imagesDir = path.join(exportDir, 'images')

      // ディレクトリを作成（既存の場合は上書き運用なのでそのまま利用）
      // images/ は画像がある場合のみ作成する（Mermaid のみの会話で空フォルダを残さない）
      await fs.promises.mkdir(images.length > 0 ? imagesDir : exportDir, { recursive: true })

      // 画像を書き込み
      for (const image of images) {
        const imagePath = path.join(imagesDir, image.filename)
        await fs.promises.writeFile(imagePath, Buffer.from(image.base64, 'base64'))
      }

      // Markdown ファイルを書き込み（タイトルと同名）
      const markdownPath = path.join(exportDir, `${safeTitle}.md`)
      await fs.promises.writeFile(markdownPath, markdown, 'utf-8')

      log.info('Chat exported to markdown successfully', {
        markdownPath,
        imageCount: images.length
      })

      return {
        success: true,
        filePath: markdownPath,
        directory: exportDir
      }
    } catch (error) {
      log.error('Failed to export chat to markdown', {
        title,
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },

  'save-chat-to-docx': async (
    _event: IpcMainInvokeEvent,
    { title, html }: { title: string; html: string }
  ) => {
    try {
      // プロジェクトパスを取得（未設定時はカレントディレクトリ）
      const projectPath = store.get('projectPath') || process.cwd()

      // タイトルをファイルシステムで安全な名前に変換
      const safeTitle = sanitizeForFilesystem(title) || 'chat-export'

      // 出力先: <projectPath>/<title>/（Markdown 版と同じ場所）
      const exportDir = path.join(projectPath, safeTitle)
      await fs.promises.mkdir(exportDir, { recursive: true })

      // 自己完結した HTML（インライン画像付き）を docx に変換する
      const document = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>${html}</body></html>`
      const generated = await HTMLtoDOCX(document, null, {
        font: DOCX_FONT,
        fontSize: DOCX_BODY_FONT_SIZE_HIP,
        complexScriptFontSize: DOCX_BODY_FONT_SIZE_HIP,
        margins: DOCX_MARGINS,
        table: { row: { cantSplit: true } },
        footer: false,
        pageNumber: false
      })
      let fileBuffer = Buffer.isBuffer(generated) ? generated : Buffer.from(generated)

      // Apply the tweaks html-to-docx offers no options for: tighter message-separator rules
      // and the heading sizes. Best-effort — if anything fails, fall back to the untouched,
      // still-valid document.
      try {
        fileBuffer = await postProcessDocx(fileBuffer)
      } catch (error) {
        log.warn('Failed to post-process docx; using untouched document', {
          error: error instanceof Error ? error.message : String(error)
        })
      }

      const docxPath = path.join(exportDir, `${safeTitle}.docx`)
      await fs.promises.writeFile(docxPath, fileBuffer)

      log.info('Chat exported to docx successfully', { docxPath })

      return {
        success: true,
        filePath: docxPath,
        directory: exportDir
      }
    } catch (error) {
      log.error('Failed to export chat to docx', {
        title,
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  },

  'save-chat-to-pdf': async (
    _event: IpcMainInvokeEvent,
    { title, html }: { title: string; html: string }
  ) => {
    try {
      // プロジェクトパスを取得（未設定時はカレントディレクトリ）
      const projectPath = store.get('projectPath') || process.cwd()

      // タイトルをファイルシステムで安全な名前に変換
      const safeTitle = sanitizeForFilesystem(title) || 'chat-export'

      // 出力先: <projectPath>/<title>/（Markdown 版と同じ場所）
      const exportDir = path.join(projectPath, safeTitle)
      await fs.promises.mkdir(exportDir, { recursive: true })

      const fileBuffer = await renderHtmlToPdf(html)

      const pdfPath = path.join(exportDir, `${safeTitle}.pdf`)
      await fs.promises.writeFile(pdfPath, fileBuffer)

      log.info('Chat exported to pdf successfully', { pdfPath })

      return {
        success: true,
        filePath: pdfPath,
        directory: exportDir
      }
    } catch (error) {
      log.error('Failed to export chat to pdf', {
        title,
        error: error instanceof Error ? error.message : String(error)
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
} as const

/**
 * Print a self-contained HTML document (inline images only, no network access needed) to PDF
 * using Chromium's own print pipeline. The HTML goes through a temp file rather than a `data:`
 * URL because an exported chat can carry several megabytes of inlined images.
 */
async function renderHtmlToPdf(html: string): Promise<Buffer> {
  const htmlPath = path.join(
    app.getPath('temp'),
    `bedrock-engineer-chat-export-${process.pid}-${Date.now()}.html`
  )
  await fs.promises.writeFile(htmlPath, html, 'utf-8')

  // Offscreen so nothing flashes on screen; no node integration — this is only a renderer for
  // our own generated markup.
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, nodeIntegration: false, contextIsolation: true }
  })

  try {
    // Resolves on did-finish-load, i.e. after the inline images have decoded.
    await printWindow.loadFile(htmlPath)
    return await printWindow.webContents.printToPDF({
      pageSize: PDF_PAGE_SIZE,
      margins: {
        top: PDF_MARGIN_INCHES,
        bottom: PDF_MARGIN_INCHES,
        left: PDF_MARGIN_INCHES,
        right: PDF_MARGIN_INCHES
      },
      printBackground: true
    })
  } finally {
    if (!printWindow.isDestroyed()) printWindow.destroy()
    await fs.promises.unlink(htmlPath).catch(() => undefined)
  }
}

/**
 * Rewrite the parts of a generated docx that html-to-docx exposes no options for: the
 * message-separator and table spacing in `word/document.xml`, and the heading styles in
 * `word/styles.xml`. Returns the original buffer unchanged if neither part needed edits.
 */
async function postProcessDocx(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)
  let changed = false

  const parts: [string, (xml: string) => string][] = [
    ['word/document.xml', (xml) => compressTables(tightenMessageRules(xml))],
    ['word/styles.xml', applyHeadingStyles]
  ]

  for (const [entryPath, transform] of parts) {
    const entry = zip.file(entryPath)
    if (!entry) continue
    const xml = await entry.async('string')
    const out = transform(xml)
    if (out === xml) continue
    zip.file(entryPath, out)
    changed = true
  }

  return changed ? zip.generateAsync({ type: 'nodebuffer' }) : buffer
}

/**
 * Retune the heading styles in `styles.xml`, which html-to-docx hardcodes into its template
 * with no option to override: set the H1-H3 run sizes to {@link DOCX_HEADING_SIZES_HIP} and
 * halve every heading's space-before (H1 goes from 24pt to 12pt, and so on down to H6).
 * Heading styles are `basedOn` Normal, so the font itself comes from the document defaults
 * and needs no patching here.
 */
function applyHeadingStyles(xml: string): string {
  return xml.replace(
    /<w:style\b[^>]*w:styleId="(Heading[1-6])"[\s\S]*?<\/w:style>/g,
    (style, styleId: string) => {
      let out = style.replace(
        /<w:spacing\b([^>]*?)w:before="(\d+)"/,
        (_whole, before: string, twip: string) =>
          `<w:spacing${before}w:before="${Math.round(Number(twip) / 2)}"`
      )

      const size = DOCX_HEADING_SIZES_HIP[styleId]
      if (size) {
        out = out
          .replace(/<w:sz w:val="\d+"\s*\/>/, `<w:sz w:val="${size}" />`)
          .replace(/<w:szCs w:val="\d+"\s*\/>/, `<w:szCs w:val="${size}" />`)
      }

      return out
    }
  )
}

/**
 * Compress the vertical space in content tables. html-to-docx pads every cell with 4pt top and
 * bottom, lets the cell paragraph inherit the document default's 6pt space-after, and follows
 * each table with a full-height empty paragraph — roughly doubling the height of a one-line row.
 * This trims the cell padding to {@link DOCX_TABLE_CELL_MARGINS}, zeroes the space around cell
 * paragraphs, and shrinks the trailing paragraph to {@link DOCX_TABLE_SPACER_HEIGHT}. That
 * paragraph is kept rather than dropped: without it two adjacent tables merge into one.
 * Message-separator rules (identified by their CCCCCC border) belong to
 * {@link tightenMessageRules} and are left alone here.
 */
function compressTables(xml: string): string {
  const out = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (table) => {
    if (table.includes('w:color="CCCCCC"')) return table

    return (
      table
        .replace(/<w:tblCellMar>[\s\S]*?<\/w:tblCellMar>/, (margins) =>
          margins.replace(
            /<w:(top|bottom|left|right) w:type="dxa" w:w="\d+"\s*\/>/g,
            (whole, edge: string) =>
              edge in DOCX_TABLE_CELL_MARGINS
                ? `<w:${edge} w:type="dxa" w:w="${DOCX_TABLE_CELL_MARGINS[edge]}"/>`
                : whole
          )
        )
        // Cell paragraphs set only the line rule, so they inherit the 6pt document space-after.
        .replace(
          /<w:spacing w:lineRule="auto"\s*\/>/g,
          '<w:spacing w:before="0" w:after="0" w:lineRule="auto"/>'
        )
    )
  })

  return out.replace(
    /(<\/w:tbl>\s*)<w:p>\s*<w:pPr>\s*<w:spacing w:lineRule="auto"\s*\/>\s*<\/w:pPr>\s*<w:r>\s*<w:rPr\s*\/>\s*<\/w:r>\s*<\/w:p>/g,
    `$1<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${DOCX_TABLE_SPACER_HEIGHT}" w:lineRule="exact"/></w:pPr></w:p>`
  )
}

/**
 * Remove the blank space html-to-docx puts around the message-separator rules. The rule is a
 * single-cell table whose only visible edge is a light-gray (CCCCCC) bottom border; the
 * library gives it fixed 80-dxa cell margins, a full-height empty cell paragraph, and an
 * auto-inserted empty paragraph after the table. This zeroes the rule's cell margins,
 * collapses its cell paragraph, and drops the trailing empty paragraph. Only rule tables
 * (identified by the CCCCCC border) are touched; body/markdown tables are left intact.
 */
function tightenMessageRules(xml: string): string {
  let out = xml

  // Drop the empty paragraph inserted immediately after each rule table.
  out = out.replace(
    /(<w:tbl>[\s\S]*?<\/w:tbl>)(\s*<w:p>\s*<w:pPr>\s*<w:spacing w:lineRule="auto"\s*\/>\s*<\/w:pPr>\s*<w:r>\s*<w:rPr\s*\/>\s*<\/w:r>\s*<\/w:p>)/g,
    (whole, table) => (table.includes('w:color="CCCCCC"') ? table : whole)
  )

  // Zero the rule cell's top/bottom margins and collapse its (empty) cell paragraph.
  out = out.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (table) => {
    if (!table.includes('w:color="CCCCCC"')) return table
    return table
      .replace(/(<w:tblCellMar>[\s\S]*?<w:top w:type="dxa" w:w=")\d+("\/>)/, '$10$2')
      .replace(/(<w:tblCellMar>[\s\S]*?<w:bottom w:type="dxa" w:w=")\d+("\/>)/, '$10$2')
      .replace(
        /<w:p\/>/,
        '<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="1" w:lineRule="exact"/></w:pPr></w:p>'
      )
  })

  return out
}

/**
 * Sanitize a string for safe use as a file or directory name across platforms.
 * Strips reserved characters, collapses whitespace, and trims length.
 */
function sanitizeForFilesystem(name: string): string {
  return (
    (name || '')
      .replace(/[/\\:*?"<>|]/g, '') // reserved characters
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f]/g, '') // control characters
      .replace(/\s+/g, ' ')
      .replace(/\.+$/, '') // no trailing dots (Windows)
      .trim()
      .slice(0, 100)
  )
}
