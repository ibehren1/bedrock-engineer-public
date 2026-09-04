import fs from 'fs'
import os from 'os'
import path from 'path'
import { MAX_TEXT_CHARS_PER_FILE, MAX_TEXT_CHARS_TOTAL } from './types'

const storeValues: Record<string, string | undefined> = {}

jest.mock('../../../preload/store', () => ({
  store: { get: (key: string) => storeValues[key] }
}))

const extractPdfText = jest.fn<Promise<string>, [string]>()
const extractDocxText = jest.fn<Promise<string>, [string]>()

jest.mock('../../handlers/pdf-handlers', () => ({
  extractPdfText: (filePath: string) => extractPdfText(filePath)
}))
jest.mock('../../handlers/docx-handlers', () => ({
  extractDocxText: (filePath: string) => extractDocxText(filePath)
}))

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildAttachmentContext } =
  require('./attachmentContext') as typeof import('./attachmentContext')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const manager = require('./attachmentsManager') as typeof import('./attachmentsManager')

const SESSION_ID = 'session_1756900000000'

let projectPath: string

const bytes = (content: string | Buffer): Uint8Array =>
  new Uint8Array(Buffer.isBuffer(content) ? content : Buffer.from(content))

const add = (name: string, content: string | Buffer) =>
  manager.addAttachments(SESSION_ID, [{ name, bytes: bytes(content) }])

/** Minimal PNG header so image validation has real dimensions to read. */
const png = (width = 10, height = 10): Buffer => {
  const buffer = Buffer.alloc(24)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0)
  buffer.write('IHDR', 12, 'latin1')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

const textOf = (blocks: unknown[]): string => (blocks[0] as { text: string }).text

beforeEach(() => {
  projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'attachments-context-'))
  storeValues.projectPath = projectPath
  storeValues.userDataPath = undefined
  extractPdfText.mockReset()
  extractDocxText.mockReset()
})

afterEach(() => {
  fs.rmSync(projectPath, { recursive: true, force: true })
})

it('produces nothing for a chat with no attachments', async () => {
  const result = await buildAttachmentContext(SESSION_ID)
  expect(result.blocks).toEqual([])
  expect(result.fileCount).toBe(0)
})

it('inlines a text file with its name and absolute path', async () => {
  const added = await add('notes.txt', 'the quick brown fox')
  const result = await buildAttachmentContext(SESSION_ID)

  expect(textOf(result.blocks)).toContain('the quick brown fox')
  expect(textOf(result.blocks)).toContain(added.added[0].path)
  expect(result.totalTextChars).toBe('the quick brown fox'.length)
})

it('extracts PDF and DOCX through the existing extractors', async () => {
  extractPdfText.mockResolvedValue('pdf body')
  extractDocxText.mockResolvedValue('docx body')
  await add('spec.pdf', 'binary-ish')
  await add('memo.docx', 'binary-ish')

  const result = await buildAttachmentContext(SESSION_ID)

  expect(extractPdfText).toHaveBeenCalledTimes(1)
  expect(extractDocxText).toHaveBeenCalledTimes(1)
  expect(textOf(result.blocks)).toContain('pdf body')
  expect(textOf(result.blocks)).toContain('docx body')
})

it('truncates a file past the per-file cap and says so', async () => {
  await add('huge.txt', 'x'.repeat(MAX_TEXT_CHARS_PER_FILE + 500))
  const result = await buildAttachmentContext(SESSION_ID)

  expect(result.truncatedFiles).toEqual(['huge.txt'])
  expect(textOf(result.blocks)).toContain('[truncated:')
  expect(result.totalTextChars).toBe(MAX_TEXT_CHARS_PER_FILE)
})

it('stops inlining once the whole-folder budget is spent', async () => {
  const perFile = 'y'.repeat(MAX_TEXT_CHARS_PER_FILE)
  const fileCount = MAX_TEXT_CHARS_TOTAL / MAX_TEXT_CHARS_PER_FILE
  for (let index = 0; index < fileCount; index++) {
    await add(`file-${index}.txt`, perFile)
  }
  await add('last.txt', 'never inlined')

  const result = await buildAttachmentContext(SESSION_ID)

  expect(result.totalTextChars).toBe(MAX_TEXT_CHARS_TOTAL)
  expect(result.truncatedFiles).toContain('last.txt')
  expect(textOf(result.blocks)).not.toContain('never inlined')
})

it('lists a spreadsheet by path instead of injecting its bytes', async () => {
  await add('data.xlsx', 'PK binary')
  const result = await buildAttachmentContext(SESSION_ID)

  expect(textOf(result.blocks)).toContain('content="not-extracted"')
  expect(textOf(result.blocks)).not.toContain('binary')
})

it('does not inline a binary file that carries a text extension', async () => {
  await add('secretly-binary.txt', Buffer.from([0x1f, 0x8b, 0x00, 0x41, 0x42]))
  const result = await buildAttachmentContext(SESSION_ID)

  expect(textOf(result.blocks)).toContain('content="not-extracted"')
  expect(result.skippedFiles.map((file) => file.name)).toEqual(['secretly-binary.txt'])
})

it('marks an empty file rather than emitting an empty body', async () => {
  await add('blank.txt', '')
  const result = await buildAttachmentContext(SESSION_ID)

  expect(textOf(result.blocks)).toContain('content="empty"')
})

it('adds an image block with the format Bedrock expects', async () => {
  await add('photo.jpg', png())
  const result = await buildAttachmentContext(SESSION_ID)

  const imageBlock = result.blocks.find((block) => 'image' in (block as object)) as {
    image: { format: string; source: { bytes: string } }
  }
  // .jpg has to be declared as jpeg, and base64 is accepted for the bytes.
  expect(imageBlock.image.format).toBe('jpeg')
  expect(imageBlock.image.source.bytes).toBe(png().toString('base64'))
  expect(result.imageCount).toBe(1)
})

it('skips an image that grew past the limit after it was attached', async () => {
  const added = await add('photo.png', png())
  fs.writeFileSync(added.added[0].path, Buffer.concat([png(), Buffer.alloc(4 * 1024 * 1024)]))

  const result = await buildAttachmentContext(SESSION_ID)

  expect(result.imageCount).toBe(0)
  expect(result.skippedFiles[0]).toEqual({
    name: 'photo.png',
    reason: expect.stringContaining('3.75 MB')
  })
})

it('reports an extraction failure instead of dropping the file silently', async () => {
  extractPdfText.mockRejectedValue(new Error('encrypted document'))
  await add('locked.pdf', 'binary-ish')

  const result = await buildAttachmentContext(SESSION_ID)

  expect(result.skippedFiles).toEqual([{ name: 'locked.pdf', reason: 'encrypted document' }])
  expect(textOf(result.blocks)).toContain('encrypted document')
})
