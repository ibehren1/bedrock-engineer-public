import fs from 'fs'
import os from 'os'
import path from 'path'
import { resolveInside, sanitizeAttachmentName, uniqueNameIn } from './fileNaming'

describe('sanitizeAttachmentName', () => {
  it('keeps an ordinary name as it is', () => {
    expect(sanitizeAttachmentName('report.pdf')).toBe('report.pdf')
  })

  it('keeps non-ASCII names readable', () => {
    // The old renderer sanitizer reduced this to "_.pdf"; the folder is now something the
    // user browses, so the name has to survive.
    expect(sanitizeAttachmentName('仕様書.pdf')).toBe('仕様書.pdf')
    expect(sanitizeAttachmentName('résumé final.docx')).toBe('résumé final.docx')
  })

  it('strips reserved characters and control characters', () => {
    expect(sanitizeAttachmentName('in:va*lid?.txt')).toBe('invalid.txt')
    expect(sanitizeAttachmentName(`bad${String.fromCharCode(7)}name.txt`)).toBe('badname.txt')
  })

  it('drops any directory part', () => {
    expect(sanitizeAttachmentName('/etc/passwd')).toBe('passwd')
    expect(sanitizeAttachmentName('../../secret.txt')).toBe('secret.txt')
  })

  it('refuses to produce a hidden name or a trailing dot', () => {
    expect(sanitizeAttachmentName('.env')).toBe('env')
    expect(sanitizeAttachmentName('notes.')).toBe('notes')
  })

  it('falls back when nothing usable is left', () => {
    expect(sanitizeAttachmentName('')).toBe('attachment')
    expect(sanitizeAttachmentName('..')).toBe('attachment')
    expect(sanitizeAttachmentName('???')).toBe('attachment')
  })

  it('caps a very long stem but keeps the extension', () => {
    const result = sanitizeAttachmentName(`${'a'.repeat(300)}.txt`)
    expect(result).toBe(`${'a'.repeat(100)}.txt`)
  })
})

describe('uniqueNameIn', () => {
  let directory: string

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'attachments-naming-'))
  })

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('returns the name unchanged when nothing collides', () => {
    expect(uniqueNameIn(directory, 'a.txt')).toBe('a.txt')
  })

  it('adds an increasing suffix rather than clobbering a file', () => {
    fs.writeFileSync(path.join(directory, 'a.txt'), 'one')
    expect(uniqueNameIn(directory, 'a.txt')).toBe('a-1.txt')

    fs.writeFileSync(path.join(directory, 'a-1.txt'), 'two')
    expect(uniqueNameIn(directory, 'a.txt')).toBe('a-2.txt')
  })
})

describe('resolveInside', () => {
  const directory = path.join(os.tmpdir(), 'attachments-resolve')

  it('accepts a plain child name', () => {
    expect(resolveInside(directory, 'file.txt')).toBe(path.join(directory, 'file.txt'))
  })

  it.each(['../escape.txt', 'nested/file.txt', '/etc/passwd', '.', '', '..'])(
    'refuses %p',
    (name) => {
      expect(() => resolveInside(directory, name)).toThrow()
    }
  )
})
