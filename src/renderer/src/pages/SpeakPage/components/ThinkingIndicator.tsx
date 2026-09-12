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
        <div className="flex items-center space-x-3 p-2.5 bg-accent-tint rounded-container border border-accent">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-accent-tint rounded-full flex items-center justify-center">
              <span className="text-accent text-sm font-medium">U</span>
            </div>
            <div className="flex flex-col">
              <span className="text-accent text-sm font-medium">USER</span>
            </div>
          </div>
          <div className="flex items-center">
            <span className="text-sm font-medium text-accent">Listening</span>
          </div>
        </div>
      )}

      {/* Assistant Thinking Indicator */}
      {thinkingState.waitingForAssistantResponse && (
        <div className="flex items-center space-x-3 p-2.5 bg-success-soft rounded-container border border-success">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-success-soft rounded-full flex items-center justify-center">
              <span className="text-success text-sm font-medium">A</span>
            </div>
            <div className="flex flex-col">
              <span className="text-success text-sm font-medium">ASSISTANT</span>
            </div>
          </div>
          <div className="flex items-center">
            <span className="text-sm font-medium text-accent">Thinking</span>
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
          <span className="text-xs font-medium text-accent">Listening...</span>
        </div>
      )}
      {thinkingState.waitingForAssistantResponse && (
        <div className="flex items-center">
          <span className="text-xs font-medium text-accent">Thinking...</span>
        </div>
      )}
    </div>
  )
}
