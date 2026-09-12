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
        <span className="text-xs text-ink-muted mt-0.5"></span>
        <div className="flex-1 min-w-0">
          {/* 翻訳中の表示 */}
          {isTranslating && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 border border-strong border-t-transparent rounded-full animate-spin"></div>
              <span className="text-xs text-ink-muted">翻訳中...</span>
            </div>
          )}

          {/* 翻訳完了時の表示 */}
          {translatedText && !isTranslating && (
            <div className="text-xs text-ink-muted leading-relaxed">{translatedText}</div>
          )}

          {/* エラー時の表示 */}
          {error && (
            <div className="flex items-center space-x-1">
              <span className="text-xs text-danger">翻訳失敗</span>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="text-xs text-danger hover:text-danger-strong
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
