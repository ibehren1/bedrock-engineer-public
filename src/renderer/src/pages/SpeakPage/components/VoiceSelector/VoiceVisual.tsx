import React from 'react'
import { VoiceId } from '../../constants/voices'
import { VoiceAILottie } from '@renderer/components/VoiceAI'

interface VoiceVisualProps {
  voiceId: VoiceId
  // アニメーション再実行のためのキー
  animationKey?: string | number
}

export const VoiceVisual: React.FC<VoiceVisualProps> = ({ voiceId, animationKey }) => {
  return (
    <div className="relative w-32 h-32 flex items-center justify-center">
      <VoiceAILottie
        voiceKey={animationKey || voiceId}
        style={{ width: '128px', height: '128px' }}
        className="transition-all duration-300 hover:scale-105"
      />
    </div>
  )
}
