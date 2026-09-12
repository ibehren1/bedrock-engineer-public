import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeftIcon, ChevronRightIcon, GlobeAltIcon } from '@heroicons/react/24/outline'
import { Modal } from 'flowbite-react'
import { AVAILABLE_VOICES, VoiceId } from '../../constants/voices'
import { VoiceVisual } from './VoiceVisual'
import { TRANSLATION_LANGUAGES } from '../../constants/translationLanguages'
import { useSettings } from '@renderer/contexts/SettingsContext'

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
  const [currentIndex, setCurrentIndex] = useState(0)
  const [animationKey, setAnimationKey] = useState(0)

  // Translation settings from context
  const {
    translationEnabled,
    setTranslationEnabled,
    translationTargetLanguage,
    setTranslationTargetLanguage
  } = useSettings()

  // 現在選択されている音声のインデックスを設定
  useEffect(() => {
    const index = AVAILABLE_VOICES.findIndex((voice) => voice.id === selectedVoiceId)
    if (index !== -1) {
      setCurrentIndex(index)
      // モーダルが開かれた時もアニメーションを再実行
      if (isOpen) {
        setAnimationKey((prev) => prev + 1)
      }
    }
  }, [selectedVoiceId, isOpen])

  const currentVoice = AVAILABLE_VOICES[currentIndex]

  const handlePrevious = () => {
    const newIndex = currentIndex > 0 ? currentIndex - 1 : AVAILABLE_VOICES.length - 1
    setCurrentIndex(newIndex)
    onSelectVoice(AVAILABLE_VOICES[newIndex].id)
    // 音声切り替え時にアニメーションを再実行
    setAnimationKey((prev) => prev + 1)
  }

  const handleNext = () => {
    const newIndex = currentIndex < AVAILABLE_VOICES.length - 1 ? currentIndex + 1 : 0
    setCurrentIndex(newIndex)
    onSelectVoice(AVAILABLE_VOICES[newIndex].id)
    // 音声切り替え時にアニメーションを再実行
    setAnimationKey((prev) => prev + 1)
  }

  const handleStartNewChat = () => {
    onStartNewChat()
  }

  return (
    <Modal dismissible show={isOpen} onClose={onCancel} size="md">
      <Modal.Header>{t('Select Voice')}</Modal.Header>
      <Modal.Body>
        <div className="p-2.5">
          {/* Voice Selection Section */}
          <div className="text-center mb-8">
            {/* Voice Selection */}
            <div className="flex items-center justify-center gap-4 mb-8">
              {/* Previous Button */}
              <button
                onClick={handlePrevious}
                className="p-2 rounded-full hover:bg-raised transition-colors"
                aria-label="Previous voice"
              >
                <ChevronLeftIcon className="w-4 h-4 text-ink-muted" />
              </button>

              {/* Voice Visual and Info */}
              <div className="flex flex-col items-center">
                <VoiceVisual voiceId={currentVoice.id} animationKey={animationKey} />

                <div className="mt-4 text-center">
                  <h3 className="text-heading text-ink mb-2">{currentVoice.name}</h3>
                  <p className="text-sm text-ink-muted mb-1">{t(currentVoice.description)}</p>
                  <p className="text-xs text-ink-muted">{t(currentVoice.characteristics)}</p>
                </div>
              </div>

              {/* Next Button */}
              <button
                onClick={handleNext}
                className="p-2 rounded-full hover:bg-raised transition-colors"
                aria-label="Next voice"
              >
                <ChevronRightIcon className="w-4 h-4 text-ink-muted" />
              </button>
            </div>

            {/* Indicators */}
            <div className="flex justify-center gap-2">
              {AVAILABLE_VOICES.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setCurrentIndex(index)
                    onSelectVoice(AVAILABLE_VOICES[index].id)
                    // インジケーター選択時にもアニメーションを再実行
                    setAnimationKey((prev) => prev + 1)
                  }}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    index === currentIndex ? 'bg-accent-tint' : 'bg-sunken hover:bg-raised'
                  }`}
                  aria-label={`Select ${AVAILABLE_VOICES[index].name}`}
                />
              ))}
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-subtle mb-3"></div>

          {/* Translation Settings Section */}
          <div className="space-y-2">
            {/* Translation Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <GlobeAltIcon className="w-4 h-4 text-ink-muted" />
                <div>
                  <h3 className="text-sm font-medium text-ink">{t('Translation')}</h3>
                  <p className="text-xs text-ink-muted">
                    {t('Translate AI responses to your preferred language')}
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={translationEnabled}
                  onChange={(e) => setTranslationEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-sunken peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-knob after:shadow-raised after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-accent"></div>
              </label>
            </div>

            {/* Language Selection */}
            {translationEnabled && (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-ink">{t('Target Language')}</label>
                <select
                  value={translationTargetLanguage}
                  onChange={(e) => setTranslationTargetLanguage(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-strong rounded-container shadow-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent text-sm text-ink"
                >
                  {TRANSLATION_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.nativeName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <div className="flex justify-center gap-4">
          <button
            onClick={onCancel}
            className="px-6 py-2 text-ink-muted hover:text-ink transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleStartNewChat}
            className="px-3 py-1 bg-accent text-accent-fg rounded-container hover:bg-accent-strong transition-colors"
          >
            {t('Start New Chat')}
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}
