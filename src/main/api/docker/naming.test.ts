import {
  containerNameFor,
  isDefaultChatTitle,
  slugifyTitle,
  toFolderName,
  toProjectName,
  toShortId
} from './naming'

describe('toProjectName', () => {
  it('converts a chat session id into a valid compose project name', () => {
    // Chat ids look like session_<epoch-ms>; compose rejects the underscore-led form.
    expect(toProjectName('session_1756900000000')).toBe('bedrock-sandbox-session-1756900000000')
  })

  it('lowercases and collapses characters compose would reject', () => {
    expect(toProjectName('subagent-Chat-Agent_99')).toBe('bedrock-sandbox-subagent-chat-agent-99')
  })

  it('never emits consecutive dashes', () => {
    expect(toProjectName('a__b--c')).toBe('bedrock-sandbox-a-b-c')
  })

  it('stays keyed on the session id so a folder rename cannot orphan containers', () => {
    // The folder follows the chat title; the project name must not, or compose would lose
    // track of the containers it already started.
    expect(toProjectName('session_1')).toBe(toProjectName('session_1'))
  })
})

describe('containerNameFor', () => {
  it('matches the name compose assigns to the first replica', () => {
    expect(containerNameFor('bedrock-sandbox-session-1', 'main')).toBe(
      'bedrock-sandbox-session-1-main-1'
    )
  })
})

describe('toShortId', () => {
  it('is stable for the same session id', () => {
    expect(toShortId('session_1756900000000')).toBe(toShortId('session_1756900000000'))
  })

  it('differs between session ids', () => {
    expect(toShortId('session_1')).not.toBe(toShortId('session_2'))
  })

  it('is six hex characters', () => {
    expect(toShortId('session_1')).toMatch(/^[0-9a-f]{6}$/)
  })
})

describe('slugifyTitle', () => {
  it.each([
    ['Fix the auth bug', 'fix-the-auth-bug'],
    ['  Padded  Title  ', 'padded-title'],
    ['Refactor: parse/format!', 'refactor-parse-format'],
    ['Multiple   spaces', 'multiple-spaces']
  ])('slugifies %s', (title, expected) => {
    expect(slugifyTitle(title)).toBe(expected)
  })

  it('reduces accented characters to their base letters', () => {
    expect(slugifyTitle('Café déjà vu')).toBe('cafe-deja-vu')
  })

  it('returns an empty string when nothing usable remains', () => {
    expect(slugifyTitle('日本語')).toBe('')
    expect(slugifyTitle('!!!')).toBe('')
    expect(slugifyTitle('')).toBe('')
  })

  it('caps the length and never leaves a trailing dash', () => {
    const slug = slugifyTitle('a'.repeat(80))
    expect(slug).toHaveLength(40)

    const truncated = slugifyTitle(`${'b'.repeat(39)} tail`)
    expect(truncated.endsWith('-')).toBe(false)
  })
})

describe('toFolderName', () => {
  it('combines the title slug with a short id', () => {
    const shortId = toShortId('session_1756900000000')
    expect(toFolderName('session_1756900000000', 'Fix the auth bug')).toBe(
      `fix-the-auth-bug-${shortId}`
    )
  })

  it('falls back to a session-prefixed name when there is no title', () => {
    const shortId = toShortId('session_1')
    expect(toFolderName('session_1')).toBe(`session-${shortId}`)
  })

  it('falls back when the title produces no usable slug', () => {
    const shortId = toShortId('session_1')
    expect(toFolderName('session_1', '日本語')).toBe(`session-${shortId}`)
  })

  it('keeps two chats with the same title in separate folders', () => {
    expect(toFolderName('session_1', 'Same title')).not.toBe(
      toFolderName('session_2', 'Same title')
    )
  })
})

describe('isDefaultChatTitle', () => {
  it('treats the generated "Chat <date>" title as not yet named', () => {
    // ChatSessionManager creates sessions with exactly this shape.
    expect(isDefaultChatTitle('Chat 9/3/2026, 2:22:15 PM')).toBe(true)
  })

  it('treats a missing title as not yet named', () => {
    expect(isDefaultChatTitle(undefined)).toBe(true)
    expect(isDefaultChatTitle('')).toBe(true)
  })

  it('treats a real title as named', () => {
    expect(isDefaultChatTitle('Fix the auth bug')).toBe(false)
  })

  it('does not mistake a real title that merely contains "Chat"', () => {
    expect(isDefaultChatTitle('Rework the Chat page layout')).toBe(false)
  })
})
