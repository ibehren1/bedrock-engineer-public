import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { VoiceId, AVAILABLE_VOICES } from '../../constants/voices'
import { VoiceVisual } from './VoiceVisual'

interface VoiceSelectorProps {
  isOpen: boolean
  selectedVoiceId: VoiceId
  onSelectVoice: (voiceId: VoiceId) => void
  onStartNewChat: () => void
  onCancel: () => void
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  isOpen,
  selectedVoiceId,
  onSelectVoice,
  onStartNewChat,
  onCancel
}) => {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(() =>
    AVAILABLE_VOICES.findIndex((voice) => voice.id === selectedVoiceId)
  )

  if (!isOpen) return null

  const currentVoice = AVAILABLE_VOICES[currentIndex]

  const handlePrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : AVAILABLE_VOICES.length - 1
    setCurrentIndex(newIndex)
    onSelectVoice(AVAILABLE_VOICES[newIndex].id)
  }

  const handleNext = () => {
    const newIndex = currentIndex < AVAILABLE_VOICES.length - 1 ? currentIndex + 1 : 0
    setCurrentIndex(newIndex)
    onSelectVoice(AVAILABLE_VOICES[newIndex].id)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-container p-8 max-w-md w-full mx-4 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-title text-ink">{t('Select Voice')}</h2>
        </div>

        {/* Voice Visual Container */}
        <div className="flex items-center justify-center mb-8">
          {/* Previous Button */}
          <button
            onClick={handlePrevious}
            className="p-2 text-ink-faint hover:text-ink-muted transition-colors"
            aria-label="Previous voice"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          {/* Voice Visual */}
          <div className="mx-8 flex flex-col items-center">
            <VoiceVisual voiceId={currentVoice.id} />

            {/* Voice Name */}
            <h3 className="text-heading text-ink mt-3 mb-2">{currentVoice.name}</h3>

            {/* Voice Description */}
            <p className="text-ink-muted text-center text-sm">{t(currentVoice.description)}</p>
          </div>

          {/* Next Button */}
          <button
            onClick={handleNext}
            className="p-2 text-ink-faint hover:text-ink-muted transition-colors"
            aria-label="Next voice"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Voice Indicators */}
        <div className="flex justify-center space-x-2 mb-8">
          {AVAILABLE_VOICES.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setCurrentIndex(index)
                onSelectVoice(AVAILABLE_VOICES[index].id)
              }}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === currentIndex ? 'bg-accent-tint' : 'bg-sunken hover:bg-raised'
              }`}
              aria-label={`Select ${AVAILABLE_VOICES[index].name}`}
            />
          ))}
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={onStartNewChat}
            className="w-full bg-accent hover:bg-accent-strong text-accent-fg py-1.5 px-3 rounded-full font-medium transition-colors"
          >
            {t('Start New Chat')}
          </button>

          <button
            onClick={onCancel}
            className="w-full text-ink-muted hover:text-ink py-2 text-center transition-colors"
          >
            {t('Cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
