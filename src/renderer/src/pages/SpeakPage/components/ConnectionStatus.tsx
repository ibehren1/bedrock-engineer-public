import React from 'react'
import { SpeakChatStatus } from '../hooks/useSpeakChat'

export interface ConnectionStatusProps {
  status: SpeakChatStatus
  className?: string
}

const getStatusColor = (status: SpeakChatStatus): string => {
  switch (status) {
    case 'connected':
    case 'ready':
      return 'text-green-500'
    case 'connecting':
    case 'processing':
      return 'text-yellow-500'
    case 'recording':
      return 'text-blue-500'
    case 'error':
      return 'text-red-500'
    case 'disconnected':
    default:
      return 'text-gray-500'
  }
}

const getStatusText = (status: SpeakChatStatus): string => {
  switch (status) {
    case 'disconnected':
      return 'Disconnected'
    case 'connecting':
      return 'Connecting...'
    case 'connected':
      return 'Connected'
    case 'ready':
      return 'Ready'
    case 'recording':
      return 'Recording...'
    case 'processing':
      return 'Processing...'
    case 'error':
      return 'Error'
    default:
      return 'Unknown'
  }
}

const getStatusIcon = (status: SpeakChatStatus): string => {
  switch (status) {
    case 'connected':
    case 'ready':
      return '●'
    case 'connecting':
    case 'processing':
      return '○'
    case 'recording':
      return '●'
    case 'error':
      return '✕'
    case 'disconnected':
    default:
      return '○'
  }
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({ status, className = '' }) => {
  const colorClass = getStatusColor(status)
  const statusText = getStatusText(status)
  const statusIcon = getStatusIcon(status)

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <span className={`text-sm font-medium ${colorClass}`}>{statusIcon}</span>
      <span className={`text-sm font-medium ${colorClass}`}>{statusText}</span>
      {(status === 'connecting' || status === 'processing') && (
        <div className="flex space-x-1">
          <div
            className={`w-1 h-1 rounded-full ${colorClass.replace('text-', 'bg-')} animate-pulse`}
          ></div>
          <div
            className={`w-1 h-1 rounded-full ${colorClass.replace('text-', 'bg-')} animate-pulse`}
            style={{ animationDelay: '0.2s' }}
          ></div>
          <div
            className={`w-1 h-1 rounded-full ${colorClass.replace('text-', 'bg-')} animate-pulse`}
            style={{ animationDelay: '0.4s' }}
          ></div>
        </div>
      )}
    </div>
  )
}
