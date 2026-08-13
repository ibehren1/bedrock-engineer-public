import React from 'react'
import { ThinkingState } from '../hooks/useSpeakChat'

export interface ThinkingIndicatorProps {
  thinkingState: ThinkingState
  className?: string
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  thinkingState,
  className = ''
}) => {
  if (!thinkingState.waitingForUserTranscription && !thinkingState.waitingForAssistantResponse) {
    return null
  }

  return (
    <div className={`flex flex-col space-y-2 ${className}`}>
      {/* User Thinking Indicator */}
      {thinkingState.waitingForUserTranscription && (
        <div className="flex items-center space-x-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center">
              <span className="text-blue-600 dark:text-blue-300 text-sm font-medium">U</span>
            </div>
            <div className="flex flex-col">
              <span className="text-blue-700 dark:text-blue-300 text-sm font-medium">USER</span>
            </div>
          </div>
          <div className="flex items-center">
            <span className="text-sm font-medium bg-gradient-to-r from-green-500 via-teal-500 to-blue-400 bg-[length:200%_100%] animate-gradient-x bg-clip-text text-transparent">
              Listening
            </span>
          </div>
        </div>
      )}

      {/* Assistant Thinking Indicator */}
      {thinkingState.waitingForAssistantResponse && (
        <div className="flex items-center space-x-3 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center">
              <span className="text-green-600 dark:text-green-300 text-sm font-medium">A</span>
            </div>
            <div className="flex flex-col">
              <span className="text-green-700 dark:text-green-300 text-sm font-medium">
                ASSISTANT
              </span>
            </div>
          </div>
          <div className="flex items-center">
            <span className="text-sm font-medium bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-400 bg-[length:200%_100%] animate-gradient-x bg-clip-text text-transparent">
              Thinking
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// Compact version for smaller spaces
export const CompactThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({
  thinkingState,
  className = ''
}) => {
  if (!thinkingState.waitingForUserTranscription && !thinkingState.waitingForAssistantResponse) {
    return null
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {thinkingState.waitingForUserTranscription && (
        <div className="flex items-center">
          <span className="text-xs font-medium bg-gradient-to-r from-green-500 via-teal-500 to-blue-400 bg-[length:200%_100%] animate-gradient-x bg-clip-text text-transparent">
            Listening...
          </span>
        </div>
      )}
      {thinkingState.waitingForAssistantResponse && (
        <div className="flex items-center">
          <span className="text-xs font-medium bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-400 bg-[length:200%_100%] animate-gradient-x bg-clip-text text-transparent">
            Thinking...
          </span>
        </div>
      )}
    </div>
  )
}
