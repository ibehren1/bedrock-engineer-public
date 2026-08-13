import React from 'react'
import { TranslationState } from '../hooks/useTranslation'

export interface TranslatedMessageProps {
  translationState?: TranslationState
  onRetry?: () => void
  className?: string
}

const TranslatedMessage: React.FC<TranslatedMessageProps> = ({
  translationState,
  onRetry,
  className = ''
}) => {
  // 翻訳状態がない場合は何も表示しない
  if (!translationState) {
    return null
  }

  const { translatedText, isTranslating, error } = translationState

  return (
    <div className={`mt-2 ${className}`}>
      <div className="flex items-start space-x-1">
        <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">🌐</span>
        <div className="flex-1 min-w-0">
          {/* 翻訳中の表示 */}
          {isTranslating && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 border border-gray-400 border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-gray-500 dark:text-gray-400">翻訳中...</span>
            </div>
          )}

          {/* 翻訳完了時の表示 */}
          {translatedText && !isTranslating && (
            <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              {translatedText}
            </div>
          )}

          {/* エラー時の表示 */}
          {error && (
            <div className="flex items-center space-x-1">
              <span className="text-xs text-red-500 dark:text-red-400">翻訳失敗</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300
                           underline cursor-pointer transition-colors"
                >
                  (リトライ)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TranslatedMessage
