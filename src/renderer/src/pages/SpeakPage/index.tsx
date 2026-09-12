import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { BsQuestionCircle } from 'react-icons/bs'
import { useSpeakChat } from './hooks/useSpeakChat'
import { VoiceAILottie } from '@renderer/components/VoiceAI'
import { ChatDisplay } from './components/ChatDisplay'
import { useSystemPromptModal } from '../ChatPage/modals/useSystemPromptModal'
import { AgentSelector } from '../ChatPage/components/AgentSelector'
import { ViewToggleButton } from '@renderer/components/ViewToggleButton'
import { useSettings } from '@renderer/contexts/SettingsContext'
import useSetting from '@renderer/hooks/useSetting'
import { SpeakChatStatus, ThinkingState, ToolExecutionState } from './hooks/useSpeakChat'
import { VoiceSelector } from './components/VoiceSelector'
import { VoiceId } from './constants/voices'
import { SampleTextCarousel } from './components/SampleTextCarousel'
import { usePermissionHelpModal } from './components/PermissionHelpModal'
import { RegionWarningBanner } from './components/RegionWarningBanner'
import { checkNovaSonicRegionSupport, type RegionCheckResult } from '@renderer/lib/api/novaSonic'

const API_ENDPOINT = window.store.get('apiEndpoint')

// ============================================================================
// 共通コンポーネント定義
// ============================================================================

interface PageHeaderProps {
  agents: any[]
  onOpenSystemPrompt: () => void
  onOpenVoiceSelector: () => void
  onOpenPermissionHelp: () => void
}

const PageHeader: React.FC<PageHeaderProps> = ({
  agents,
  onOpenSystemPrompt,
  onOpenVoiceSelector,
  onOpenPermissionHelp
}) => {
  const { t } = useTranslation()

  // Check if running on macOS
  const isMacOS = navigator.platform.toUpperCase().indexOf('MAC') >= 0

  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-4">
        <AgentSelector agents={agents} alignment="left" openDirection="down" />
      </div>
      <div className="flex items-center gap-2">
        {isMacOS && (
          <div className="relative mr-2 group">
            <BsQuestionCircle
              className="w-4 h-4 text-ink-muted hover:text-accent cursor-pointer"
              onClick={onOpenPermissionHelp}
            />
            <div
              className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-1 text-xs
                          font-medium bg-ink text-canvas rounded-container shadow-sm opacity-0 group-hover:opacity-100
                          transition-opacity duration-300 whitespace-nowrap pointer-events-none"
            >
              {t('permissionHelp.tooltip')}
              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-b-ink"></div>
            </div>
          </div>
        )}
        <span
          className="text-xs text-ink-faint font-thin cursor-pointer hover:text-ink"
          onClick={onOpenVoiceSelector}
        >
          VOICE
        </span>
        <span
          className="text-xs text-ink-faint font-thin cursor-pointer hover:text-ink"
          onClick={onOpenSystemPrompt}
        >
          SYSTEM_PROMPT
        </span>
      </div>
    </div>
  )
}

interface RecordingButtonProps {
  isRecording: boolean
  canStartRecording: boolean
  canStopRecording: boolean
  status: SpeakChatStatus
  onStart: () => void
  onStop: () => void
  size?: 'small' | 'large'
}

const RecordingButton: React.FC<RecordingButtonProps> = ({
  isRecording,
  canStartRecording,
  canStopRecording,
  status,
  onStart,
  onStop,
  size = 'large'
}) => {
  const sizeClass = size === 'large' ? 'w-10 h-10' : 'w-8 h-8'
  const iconSize = size === 'large' ? 'w-4 h-4' : 'w-3.5 h-3.5'

  if (isRecording) {
    return (
      <button
        onClick={onStop}
        disabled={!canStopRecording}
        className={`${sizeClass} rounded-full flex items-center justify-center font-medium transition-colors border ${
          canStopRecording
            ? 'bg-danger-soft hover:bg-danger-soft-strong text-danger border-danger'
            : 'bg-raised cursor-not-allowed text-ink-faint border-subtle'
        }`}
        title="Stop Recording"
      >
        <svg className={iconSize} fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      </button>
    )
  }

  return (
    <button
      onClick={onStart}
      disabled={!canStartRecording}
      className={`${sizeClass} rounded-full flex items-center justify-center font-medium transition-colors border ${
        canStartRecording
          ? size === 'large'
            ? 'bg-accent-tint hover:bg-accent-tint-strong text-accent border-accent'
            : 'bg-success-soft hover:bg-success-soft-strong text-success border-success'
          : 'bg-raised cursor-not-allowed text-ink-faint border-subtle'
      }`}
      title={status === 'processing' ? 'Processing...' : 'Start Recording'}
    >
      {status === 'processing' ? (
        <svg
          className={`${iconSize} animate-spin`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      ) : (
        <svg className={iconSize} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      )}
    </button>
  )
}

interface ThinkingIndicatorProps {
  thinkingState: ThinkingState
}

const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ thinkingState }) => {
  if (!thinkingState.waitingForUserTranscription && !thinkingState.waitingForAssistantResponse) {
    return null
  }

  const isListening = thinkingState.waitingForUserTranscription
  const text = isListening ? 'Listening' : 'Thinking'

  return <span className="text-heading font-semibold text-accent">{text}</span>
}

interface ErrorDisplayProps {
  status: SpeakChatStatus
  errorState: any
  onOpenSettings?: () => void
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ status, errorState, onOpenSettings }) => {
  const { t } = useTranslation()

  if (status !== 'error') return null

  const handleReload = () => {
    window.location.reload()
  }

  // Check if this is a region-related error
  const isRegionRelatedError = (message: string): boolean => {
    const regionKeywords = [
      'region',
      'nova sonic',
      'nova-sonic',
      'not available',
      'unauthorized',
      'access denied',
      'forbidden',
      'ValidationException',
      'UnauthorizedOperation'
    ]
    return regionKeywords.some((keyword) => message.toLowerCase().includes(keyword.toLowerCase()))
  }

  // Check if this is a Nova Sonic content-filter block. Nova Sonic guardrails reject the
  // request (including the agent's system prompt) with this message, which otherwise looks
  // like a generic connection failure.
  const isContentFilterError = (message: string): boolean => {
    const m = message.toLowerCase()
    return m.includes('content filter') || m.includes('blocked by our content')
  }

  // Get error message based on error state
  const getErrorMessage = () => {
    if (errorState) {
      const baseMessage = errorState.message || 'An unknown error occurred'

      // Content-filter blocks are the most common failure with agent system prompts on
      // Nova Sonic. Explain what happened and how to fix it, since the raw message alone
      // ("blocked by our content filters") doesn't tell the user where to look.
      if (isContentFilterError(baseMessage)) {
        return t('voiceChat.error.contentFilter', {
          defaultValue:
            "Voice Chat was blocked by Amazon Bedrock's content filters. This is usually triggered by wording in the selected agent's system prompt. Try editing the agent's system prompt or switching agents.",
          message: baseMessage.slice(0, 150)
        })
      }

      // Check for region-specific errors
      if (isRegionRelatedError(baseMessage)) {
        return t('voiceChat.error.regionNotSupported', {
          defaultValue:
            'Voice Chat is not available in the current region or there are permission issues. Please check your AWS region settings.',
          message: baseMessage.slice(0, 100) // Limit message length
        })
      }

      switch (errorState.type) {
        case 'connection':
          return baseMessage.includes('region') ||
            baseMessage.includes('Nova Sonic') ||
            baseMessage.includes('nova-sonic')
            ? t('voiceChat.error.regionConnection', {
                defaultValue:
                  'Failed to connect to Voice Chat service. This may be due to region compatibility issues.',
                originalMessage: baseMessage
              })
            : baseMessage || 'Connection error occurred'
        case 'recording':
          return baseMessage || 'Recording error occurred'
        case 'audio':
          return baseMessage || 'Audio processing error occurred'
        default:
          return baseMessage
      }
    }
    return 'Connection error. Please try reconnecting.'
  }

  // Get error icon based on error type
  const getErrorIcon = () => {
    if (errorState?.type === 'recording') {
      return (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      )
    }
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    )
  }

  const isRegionError = errorState && isRegionRelatedError(errorState.message || '')
  const isFilterError = errorState && isContentFilterError(errorState.message || '')

  return (
    <div className="fixed bottom-4 right-4 bg-danger-soft text-danger px-2.5 py-1 rounded-container shadow-lg max-w-sm">
      <div className="flex items-start space-x-2">
        {getErrorIcon()}
        <div className="flex flex-col space-y-1 flex-1">
          <span className="text-sm font-medium">{getErrorMessage()}</span>
          {errorState?.timestamp && (
            <span className="text-xs text-danger">
              {new Date(errorState.timestamp).toLocaleTimeString()}
            </span>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            {(isRegionError || isFilterError) && onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="text-xs bg-warning hover:bg-warning-strong px-2 py-1 rounded-control transition-colors"
              >
                {t('voiceChat.error.openSettings', 'Open Settings')}
              </button>
            )}
            <button
              onClick={handleReload}
              className="text-xs bg-danger hover:bg-danger-strong px-2 py-1 rounded-control transition-colors"
            >
              {t('common.reload', 'Reload Page')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface FixedElementsProps {
  showChat: boolean
  onToggleChat: (show: boolean) => void
  status: SpeakChatStatus
  errorState: any
  onOpenSettings?: () => void
}

const FixedElements: React.FC<FixedElementsProps> = ({
  showChat,
  onToggleChat,
  status,
  errorState,
  onOpenSettings
}) => (
  <>
    <div className={`fixed right-4 z-50 ${status === 'error' ? 'bottom-20' : 'bottom-4'}`}>
      <ViewToggleButton isDetailView={showChat} onToggle={onToggleChat} />
    </div>
    <ErrorDisplay status={status} errorState={errorState} onOpenSettings={onOpenSettings} />
  </>
)

// ============================================================================
// ビュー別コンポーネント
// ============================================================================

interface SimpleViewProps {
  isRecording: boolean
  canStartRecording: boolean
  canStopRecording: boolean
  status: SpeakChatStatus
  thinkingState: ThinkingState
  onStartRecording: () => void
  onStopRecording: () => void
  currentAgentScenarios?: Array<{ title: string; content: string }>
  chat: any
}

const SimpleView: React.FC<SimpleViewProps> = ({
  isRecording,
  canStartRecording,
  canStopRecording,
  status,
  thinkingState,
  onStartRecording,
  onStopRecording,
  currentAgentScenarios = [],
  chat
}) => {
  const hasMessages = chat && chat.history && chat.history.length > 0

  return (
    <>
      {/* Main content - centered AI icon */}
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-3">
          <VoiceAILottie
            style={{ width: 240, height: 240 }}
            loop={isRecording || status === 'processing'}
            autoplay={isRecording || status === 'processing'}
          />
          <ThinkingIndicator thinkingState={thinkingState} />

          {/* Sample Text Animation */}
          <SampleTextCarousel
            scenarios={currentAgentScenarios}
            isVisible={!hasMessages}
            className="mt-4"
          />
        </div>
      </div>

      {/* Bottom controls */}
      <div className="pb-16 flex items-center justify-center">
        <RecordingButton
          isRecording={isRecording}
          canStartRecording={canStartRecording}
          canStopRecording={canStopRecording}
          status={status}
          onStart={onStartRecording}
          onStop={onStopRecording}
          size="large"
        />
      </div>
    </>
  )
}

interface DetailViewProps {
  chat: any
  thinkingState: ThinkingState
  toolExecutionState: ToolExecutionState
  canStartRecording: boolean
  canStopRecording: boolean
  status: SpeakChatStatus
  onStartRecording: () => void
  onStopRecording: () => void
}

const DetailView: React.FC<DetailViewProps> = ({
  chat,
  thinkingState,
  toolExecutionState,
  canStartRecording,
  canStopRecording,
  status,
  onStartRecording,
  onStopRecording
}) => (
  <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
    <div className="flex-1 overflow-y-auto">
      <ChatDisplay
        chat={chat}
        thinkingState={thinkingState}
        toolExecutionState={toolExecutionState}
        className="h-full"
        audioControls={
          <div className="flex items-center justify-center space-x-4 p-2.5">
            <RecordingButton
              isRecording={false}
              canStartRecording={canStartRecording}
              canStopRecording={false}
              status={status}
              onStart={onStartRecording}
              onStop={onStopRecording}
              size="small"
            />
            <RecordingButton
              isRecording={true}
              canStartRecording={false}
              canStopRecording={canStopRecording}
              status={status}
              onStart={onStartRecording}
              onStop={onStopRecording}
              size="small"
            />
          </div>
        }
      />
    </div>
  </div>
)

// ============================================================================
// メインコンポーネント
// ============================================================================

export const SpeakPage: React.FC = () => {
  const navigate = useNavigate()
  const [showChat, setShowChat] = useState(false)
  const [showVoiceSelector, setShowVoiceSelector] = useState(false)
  const [regionCheck, setRegionCheck] = useState<RegionCheckResult | null>(null)
  const [regionCheckLoading, setRegionCheckLoading] = useState(true)
  const [showRegionWarning, setShowRegionWarning] = useState(true)
  const {
    currentAgentSystemPrompt,
    selectedAgentId,
    getAgentTools,
    selectedVoiceId,
    setSelectedVoiceId,
    currentAgent
  } = useSettings()
  const { agents } = useSetting()

  // 現在のエージェントのツール情報を取得
  const agentTools = getAgentTools(selectedAgentId)

  const {
    status,
    isConnected,
    isRecording,
    thinkingState,
    toolExecutionState,
    errorState,
    chat,
    connect,
    disconnect,
    startRecording,
    stopRecording,
    systemPrompt
  } = useSpeakChat(API_ENDPOINT, currentAgentSystemPrompt, agentTools, selectedVoiceId)

  // Check region support when component mounts
  useEffect(() => {
    const checkRegionSupport = async () => {
      try {
        setRegionCheckLoading(true)
        const result = await checkNovaSonicRegionSupport()
        setRegionCheck(result)

        // If region is supported, show warning banner only briefly if there was an error
        if (result.isSupported && !result.error) {
          setShowRegionWarning(false)
        }
      } catch (error) {
        console.error('Failed to check region support:', error)
        setRegionCheck({
          isSupported: false,
          currentRegion: 'unknown',
          supportedRegions: ['us-east-1', 'us-west-2'],
          error: 'Failed to check region support'
        })
      } finally {
        setRegionCheckLoading(false)
      }
    }

    checkRegionSupport()
  }, [])

  // Auto-connect when component mounts (only if region is supported)
  useEffect(() => {
    // Only proceed with connection if region check is complete and region is supported
    if (regionCheckLoading || !regionCheck) {
      return
    }

    if (!regionCheck.isSupported) {
      console.log('SpeakPage: Skipping connection - Nova Sonic not supported in current region')
      return
    }

    // Only connect on initial mount and if not already connected
    const timer = setTimeout(() => {
      if (!isConnected && status === 'disconnected') {
        console.log('SpeakPage: Attempting to connect to server...')
        connect()
      } else {
        console.log('SpeakPage: Skipping connection (already connected or connecting)', {
          isConnected,
          status
        })
      }
    }, 100) // Small delay to ensure proper initialization

    return () => {
      clearTimeout(timer)
      console.log('SpeakPage: Component unmounting')
    }
  }, [regionCheck, regionCheckLoading, isConnected, status, connect])

  const {
    show: showSystemPromptModal,
    handleClose: handleCloseSystemPromptModal,
    handleOpen: handleOpenSystemPromptModal,
    SystemPromptModal
  } = useSystemPromptModal()

  const { PermissionHelpModal, openModal: openPermissionHelpModal } = usePermissionHelpModal()

  const handleStartRecording = async () => {
    try {
      await startRecording()
    } catch (error) {
      console.error('Failed to start recording:', error)
    }
  }

  const handleStopRecording = () => {
    stopRecording()
  }

  // Voice selector handlers
  const handleOpenVoiceSelector = () => {
    setShowVoiceSelector(true)
  }

  const handleCloseVoiceSelector = () => {
    setShowVoiceSelector(false)
  }

  const handleSelectVoice = (voiceId: VoiceId) => {
    setSelectedVoiceId(voiceId)
  }

  const handleStartNewChatWithVoice = () => {
    // チャット履歴をクリアして新しいチャットを開始
    if (isConnected) {
      disconnect()
    }
    setShowVoiceSelector(false)
    // 少し遅延してから接続を開始
    setTimeout(() => {
      connect()
    }, 100)
  }

  const handleOpenSettings = () => {
    // このプロンプトはリージョンを変更させるためのものなので、AWSタブを直接開く
    navigate('/setting/aws')
  }

  const handleDismissRegionWarning = () => {
    setShowRegionWarning(false)
  }

  const canStartRecording =
    isConnected &&
    (status === 'ready' || status === 'connected') &&
    !isRecording &&
    regionCheck?.isSupported === true
  const canStopRecording = isRecording

  const commonProps = {
    isRecording,
    canStartRecording,
    canStopRecording,
    status,
    thinkingState,
    onStartRecording: handleStartRecording,
    onStopRecording: handleStopRecording
  }

  return (
    <div className="flex p-3 h-full">
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <PageHeader
          agents={agents}
          onOpenSystemPrompt={handleOpenSystemPromptModal}
          onOpenVoiceSelector={handleOpenVoiceSelector}
          onOpenPermissionHelp={openPermissionHelpModal}
        />

        {/* Region Warning Banner */}
        {!regionCheckLoading && regionCheck && !regionCheck.isSupported && showRegionWarning && (
          <RegionWarningBanner
            currentRegion={regionCheck.currentRegion}
            supportedRegions={regionCheck.supportedRegions}
            onDismiss={handleDismissRegionWarning}
            onOpenSettings={handleOpenSettings}
          />
        )}

        {/* Main Content */}
        {showChat ? (
          <DetailView chat={chat} toolExecutionState={toolExecutionState} {...commonProps} />
        ) : (
          <SimpleView
            {...commonProps}
            currentAgentScenarios={currentAgent?.scenarios || []}
            chat={chat}
          />
        )}

        {/* Modals */}
        <SystemPromptModal
          isOpen={showSystemPromptModal}
          onClose={handleCloseSystemPromptModal}
          systemPrompt={systemPrompt}
        />

        {/* Voice Selector Modal */}
        <VoiceSelector
          isOpen={showVoiceSelector}
          selectedVoiceId={selectedVoiceId as VoiceId}
          onSelectVoice={handleSelectVoice}
          onStartNewChat={handleStartNewChatWithVoice}
          onCancel={handleCloseVoiceSelector}
        />

        {/* Permission Help Modal */}
        <PermissionHelpModal />

        {/* Fixed Elements */}
        <FixedElements
          showChat={showChat}
          onToggleChat={setShowChat}
          status={status}
          errorState={errorState}
          onOpenSettings={handleOpenSettings}
        />
      </div>
    </div>
  )
}

export default SpeakPage
