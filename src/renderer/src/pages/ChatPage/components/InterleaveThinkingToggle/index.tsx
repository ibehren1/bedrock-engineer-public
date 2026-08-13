import React from 'react'
import { useSettings } from '@renderer/contexts/SettingsContext'
import { useTranslation } from 'react-i18next'
import { TbBolt } from 'react-icons/tb'

type InterleaveThinkingToggleProps = {
  className?: string
}

export const InterleaveThinkingToggle: React.FC<InterleaveThinkingToggleProps> = ({
  className
}) => {
  const { currentLLM, thinkingMode, interleaveThinking, setInterleaveThinking } = useSettings()
  const { t } = useTranslation()

  // Only show for Claude Sonnet 4 and Claude Opus 4
  const isClaude4Model =
    currentLLM.modelId.includes('claude-sonnet-4') || currentLLM.modelId.includes('claude-opus-4')

  // Only show for supported models and when thinking mode is enabled
  if (!isClaude4Model || thinkingMode?.type === 'disabled' || thinkingMode?.type === undefined) {
    return null
  }

  const handleToggle = () => {
    setInterleaveThinking(!interleaveThinking)
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`flex items-center gap-1 text-sm rounded-md transition-colors p-1 hover:bg-gray-100 dark:hover:bg-gray-700 ${
        className || ''
      }`}
      title={t('interleaveThinking.title')}
    >
      <TbBolt
        className={`size-4 ${
          interleaveThinking ? 'text-amber-500' : 'text-gray-400 dark:text-gray-500'
        }`}
      />
      <span
        className={`whitespace-nowrap text-xs ${
          interleaveThinking
            ? 'text-amber-600 dark:text-amber-400 font-medium'
            : 'text-gray-500 dark:text-gray-500'
        }`}
      >
        {t('interleaveThinking.label')}
      </span>
    </button>
  )
}
