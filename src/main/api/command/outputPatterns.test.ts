import { detectErrors, detectServerReady, detectWaitingForInput } from './outputPatterns'

describe('detectWaitingForInput', () => {
  it('detects an inquirer-style question', () => {
    const result = detectWaitingForInput('? Which framework do you want?\n')
    expect(result.isWaiting).toBe(true)
    expect(result.prompt).toBe('Which framework do you want?')
  })

  it('detects a trailing colon prompt', () => {
    const result = detectWaitingForInput('Enter name: ')
    expect(result.isWaiting).toBe(true)
    expect(result.prompt).toBe('Enter name: ')
  })

  it.each([
    'After this operation, 12.3 MB of additional disk space will be used.\nDo you want to continue? [Y/n] ',
    'Remove the package? [y/N]'
  ])('detects an apt/dpkg confirmation: %s', (output) => {
    // A bare ubuntu:26.04 sandbox hits these constantly, and they end in a bracket
    // rather than a colon, so the older two patterns miss them.
    const result = detectWaitingForInput(output)
    expect(result.isWaiting).toBe(true)
    expect(result.prompt).toContain('[')
  })

  it('does not fire on ordinary output', () => {
    expect(detectWaitingForInput('Reading package lists... Done\n').isWaiting).toBe(false)
  })
})

describe('detectServerReady', () => {
  it.each(['Server listening on port 3000', 'compiled successfully', 'waiting for file changes'])(
    'recognizes %s',
    (output) => {
      expect(detectServerReady(output)).toBe(true)
    }
  )

  it('is case-insensitive', () => {
    expect(detectServerReady('LISTENING')).toBe(true)
  })

  it('does not fire on unrelated output', () => {
    expect(detectServerReady('installing dependencies')).toBe(false)
  })
})

describe('detectErrors', () => {
  it('flags a known error pattern on stdout', () => {
    expect(detectErrors('Error: something broke', '')).toBe(true)
  })

  it('flags a known error pattern on stderr', () => {
    expect(detectErrors('', 'command not found')).toBe(true)
  })

  it('flags "app crashed" even when a watch loop message follows', () => {
    // Documents existing behavior: 'app crashed' is itself an entry in errorPatterns, so
    // the first check short-circuits and the "crashed but recovered into a watch loop"
    // carve-out below it never gets a chance to run. Preserved as-is because the host
    // command path has always behaved this way.
    expect(detectErrors('app crashed waiting for file changes', '')).toBe(true)
  })

  it('passes clean output through', () => {
    expect(detectErrors('Done in 1.2s', '')).toBe(false)
  })
})
