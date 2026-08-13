// 音声ID定数
export type VoiceId = 'amy' | 'matthew' | 'tiffany'

// 音声メタデータの型定義
export interface VoiceMetadata {
  id: VoiceId
  name: string
  description: string
  characteristics: string
}

// 音声選択肢の定義
export const AVAILABLE_VOICES: VoiceMetadata[] = [
  {
    id: 'tiffany',
    name: 'Tiffany',
    description: 'voice.tiffany.description',
    characteristics: 'voice.tiffany.characteristics'
  },
  {
    id: 'amy',
    name: 'Amy',
    description: 'voice.amy.description',
    characteristics: 'voice.amy.characteristics'
  },
  {
    id: 'matthew',
    name: 'Matthew',
    description: 'voice.matthew.description',
    characteristics: 'voice.matthew.characteristics'
  }
]

// 音声IDから音声メタデータを取得する関数
export const getVoiceMetadata = (voiceId: VoiceId): VoiceMetadata | undefined => {
  return AVAILABLE_VOICES.find((voice) => voice.id === voiceId)
}

// デフォルト音声ID
export const DEFAULT_VOICE_ID: VoiceId = 'amy'
