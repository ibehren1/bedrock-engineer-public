// Available voice IDs for Sonic API
export const VOICE_OPTIONS = [
  { value: 'amy', label: 'Amy' },
  { value: 'matthew', label: 'Matthew' },
  { value: 'tiffany', label: 'Tiffany' }
] as const

export type VoiceId = (typeof VOICE_OPTIONS)[number]['value']

export const DEFAULT_VOICE_ID: VoiceId = 'amy'
