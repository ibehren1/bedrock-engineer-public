import { IpcMainInvokeEvent, shell } from 'electron'
import { handleFileOpen } from '../../preload/file'
import fs from 'fs'
import path from 'path'
import HTMLtoDOCX from 'html-to-docx'
import JSZip from 'jszip'
import { log } from '../../common/logger'
import { store } from '../../preload/store'

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

  // Open the project's attachments directory in the OS file manager
  // (Finder on macOS, Explorer on Windows). Creates it first if it doesn't
  // exist so the folder always opens successfully.
  'open-attachments-directory': async (_event: IpcMainInvokeEvent) => {
    try {
      const projectPath = store.get('projectPath') as string
      if (!projectPath) {
        return { success: false, error: 'Project path not set' }
      }

      const attachmentsDir = path.join(projectPath, '.bedrock-engineer', 'attachments')
      await fs.promises.mkdir(attachmentsDir, { recursive: true })

      const errorMessage = await shell.openPath(attachmentsDir)
      if (errorMessage) {
        return { success: false, error: errorMessage }
      }

      return { success: true, path: attachmentsDir }
    } catch (error) {
      log.error('Failed to open attachments directory', {
        error: error instanceof Error ? error.message : String(error)
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
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
      await fs.promises.mkdir(imagesDir, { recursive: true })

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
        table: { row: { cantSplit: true } },
        footer: false,
        pageNumber: false
      })
      let fileBuffer = Buffer.isBuffer(generated) ? generated : Buffer.from(generated)

      // Tighten the message-separator rules (html-to-docx surrounds tables with blank
      // paragraphs and fixed cell margins that can't be controlled from HTML). Best-effort:
      // if anything fails, fall back to the untouched, still-valid document.
      try {
        fileBuffer = await tightenMessageRules(fileBuffer)
      } catch (error) {
        log.warn('Failed to tighten docx message rules; using untouched document', {
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
  }
} as const

/**
 * Remove the blank space html-to-docx puts around the message-separator rules. The rule is a
 * single-cell table whose only visible edge is a light-gray (CCCCCC) bottom border; the
 * library gives it fixed 80-dxa cell margins, a full-height empty cell paragraph, and an
 * auto-inserted empty paragraph after the table. This rewrites `word/document.xml` to zero the
 * rule's cell margins, collapse its cell paragraph, and drop the trailing empty paragraph.
 * Only rule tables (identified by the CCCCCC border) are touched; body/markdown tables are
 * left intact. Returns the original buffer unchanged if there is nothing to tighten.
 */
async function tightenMessageRules(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer)
  const docXml = zip.file('word/document.xml')
  if (!docXml) return buffer

  const xml = await docXml.async('string')
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

  if (out === xml) return buffer

  zip.file('word/document.xml', out)
  return zip.generateAsync({ type: 'nodebuffer' })
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
