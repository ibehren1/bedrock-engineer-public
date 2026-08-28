import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import AILogo from '../../assets/images/icons/bedrock-color.png'
import { MessageList } from './components/MessageList'
import InputFormContainer, { InputFormContainerRef } from './components/InputFormContainer'
import { ExampleScenarios } from './components/ExampleScenarios'
import { useAgentChat } from './hooks/useAgentChat'
import useSetting from '@renderer/hooks/useSetting'
import { IgnoreSettingsModal } from '@renderer/components/IgnoreSettingsModal'
import { useToolSettingModal } from './modals/useToolSettingModal'
import { FiChevronRight, FiBarChart2 } from 'react-icons/fi'
import { FaListCheck } from 'react-icons/fa6'
import { Tooltip } from 'flowbite-react'
import { useTranslation } from 'react-i18next'
import { AttachedImage } from './components/InputForm/TextArea'
import { ChatHistory } from './components/ChatHistory'
import { useSystemPromptModal } from './modals/useSystemPromptModal'
import { useTokenAnalyticsModal, calculateAnalytics } from './modals/useTokenAnalyticsModal'
import { useTodoModal } from './modals/useTodoModal'
import { useChatHistory } from '@renderer/contexts/ChatHistoryContext'
import { useLocation } from 'react-router-dom'
import { useStreamingAutoScroll } from '@renderer/hooks/useStreamingAutoScroll'
import { useLightProcessingModel } from '@renderer/lib/modelSelection'
import { generateSessionTitle } from './utils/titleGenerator'
import { buildChatMarkdown } from './utils/chatExport'
import { buildChatHtml } from './utils/chatDocxExport'
import { buildChatPdfHtml } from './utils/chatPdfExport'
import { avatarDataUrl } from './utils/chatHtmlExport'
import { DrawioRasterizer, DrawioRasterizerRef } from './utils/DrawioRasterizer'
import { allModels } from '@common/models/models'
import { IdentifiableMessage } from '@/types/chat/message'
import toast from 'react-hot-toast'

export default function ChatPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const {
    currentLLM: llm,
    projectPath,
    selectDirectory,
    sendMsgKey,
    selectedAgentId,
    setSelectedAgentId,
    agents,
    currentAgent,
    currentAgentSystemPrompt: systemPrompt,
    availableModels,
    userEmoji,
    userName
  } = useSetting()

  const currentScenarios = currentAgent?.scenarios || []
  const inputFormRef = useRef<InputFormContainerRef>(null)

  const {
    messages,
    loading,
    reasoning,
    waitingForResponse,
    timeoutCountdown,
    heartbeatCount,
    handleSubmit,
    currentSessionId,
    setCurrentSessionId,
    clearChat,
    setMessages,
    stopGeneration
  } = useAgentChat(llm?.modelId, systemPrompt, selectedAgentId)

  // 送信ハンドラをuseCallbackでメモ化
  const onSubmit = useCallback(
    (input: string, images: AttachedImage[]) => {
      handleSubmit(input, images)
    },
    [handleSubmit]
  )

  const { deleteMessage, getSession, updateSessionTitle } = useChatHistory()
  const { getLightModelId } = useLightProcessingModel()

  // DrawIO diagrams render in an iframe, so a live component is needed to rasterize them.
  const drawioRasterizerRef = useRef<DrawioRasterizerRef>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isExportingWord, setIsExportingWord] = useState(false)
  const [isExportingPdf, setIsExportingPdf] = useState(false)

  // モデルIDから表示情報を解決する（チャットのアバターと同じロジック）。
  const resolveModel = useCallback(
    (modelId?: string) =>
      modelId
        ? availableModels.find((m) => m.modelId === modelId) ??
          allModels.find((m) => m.modelId === modelId)
        : undefined,
    [availableModels]
  )

  // 見出しは「Assistant – <モデルID>」「User – <ユーザー名>」の形式にする。
  const roleLabel = useCallback(
    (message: IdentifiableMessage): string => {
      if (message.role === 'assistant') {
        const modelId = message.metadata?.modelId
        return modelId ? `Assistant – ${modelId}` : 'Assistant'
      }
      return userName ? `User – ${userName}` : 'User'
    },
    [userName]
  )

  const handleDeleteMessage = (index: number) => {
    // メッセージの配列のコピーを作成
    const updatedMessages = [...messages]

    // メッセージを削除
    updatedMessages.splice(index, 1)

    // 更新されたメッセージの配列を設定
    setMessages(updatedMessages)

    // チャット履歴が有効な場合は、対応するメッセージを削除
    if (currentSessionId) {
      deleteMessage(currentSessionId, index)
    }
  }

  // Ignore Settings Modal の状態管理
  const [showIgnoreSettingsModal, setShowIgnoreSettingsModal] = useState(false)
  const handleOpenIgnoreFileModal = () => setShowIgnoreSettingsModal(true)
  const handleCloseIgnoreFileModal = () => setShowIgnoreSettingsModal(false)

  const {
    show: showSystemPromptModal,
    handleClose: handleCloseSystemPromptModal,
    handleOpen: handleOpenSystemPromptModal,
    SystemPromptModal
  } = useSystemPromptModal()

  const {
    show: showTokenAnalyticsModal,
    handleClose: handleCloseTokenAnalyticsModal,
    handleOpen: handleOpenTokenAnalyticsModal,
    TokenAnalyticsModal
  } = useTokenAnalyticsModal()

  // 会話全体の実行コストを計算（ヘッダー表示用）
  const runningCost = useMemo(
    () => calculateAnalytics(messages, llm?.modelId || '').costAnalysis.totalCost,
    [messages, llm?.modelId]
  )

  const {
    show: showTodoModal,
    handleClose: handleCloseTodoModal,
    handleOpen: handleOpenTodoModal,
    flash: todoFlash,
    TodoModal
  } = useTodoModal(messages, currentSessionId)

  // Flash the TODO header icon in the changed task's status color on each update
  const [todoFlashColor, setTodoFlashColor] = useState<string | null>(null)
  useEffect(() => {
    if (!todoFlash) return undefined
    const statusColors: Record<string, string> = {
      pending: 'text-yellow-500 dark:text-yellow-400',
      in_progress: 'text-blue-500 dark:text-blue-400',
      completed: 'text-green-500 dark:text-green-400',
      cancelled: 'text-red-500 dark:text-red-400'
    }
    setTodoFlashColor(statusColors[todoFlash.status] ?? null)
    // Animation runs 0.5s x 2; clear slightly after so the class re-applies next time
    const timer = setTimeout(() => setTodoFlashColor(null), 1100)
    return () => clearTimeout(timer)
  }, [todoFlash?.nonce])

  const {
    show: showToolSettingModal,
    handleClose: handleCloseToolSettingModal,
    handleOpen: handleOpenToolSettingModal,
    ToolSettingModal
  } = useToolSettingModal()

  // クリアハンドラをuseCallbackでメモ化
  const handleClearChat = useCallback(() => {
    if (window.confirm(t('confirmClearChat'))) {
      clearChat()
    }
  }, [clearChat, t])

  // エクスポート用のタイトルを確定する（未生成のデフォルトタイトルなら生成する）
  const resolveExportTitle = useCallback(async (): Promise<string> => {
    if (!currentSessionId) return 'Chat Export'

    let session = getSession(currentSessionId)
    if (session && session.title.startsWith('Chat ')) {
      const newTitle = await generateSessionTitle(session, getLightModelId(), t)
      if (newTitle) {
        await updateSessionTitle(currentSessionId, newTitle)
        session = getSession(currentSessionId)
      }
    }
    return session?.title?.trim() || 'Chat Export'
  }, [currentSessionId, getSession, updateSessionTitle, getLightModelId, t])

  // チャットを Markdown にエクスポートするハンドラ
  const handleExportChat = useCallback(async () => {
    if (!currentSessionId || messages.length === 0 || isExporting) return

    setIsExporting(true)
    const loadingToast = toast.loading(t('Exporting chat...'))
    try {
      const title = await resolveExportTitle()

      // Markdown を構築し、図表・画像を PNG にラスタライズする
      // 見出しは docx 版と同じ「Assistant – <modelId>」「User – <userName>」＋アバター画像
      const { markdown, images } = await buildChatMarkdown(title, messages, {
        rasterizeDrawio: (xml) =>
          drawioRasterizerRef.current?.rasterize(xml) ?? Promise.resolve(null),
        roleLabel,
        avatarDataUrl: (message) => avatarDataUrl(message, { userEmoji, resolveModel })
      })

      // ディスクに書き込む
      const result = await window.file.exportChatMarkdown({ title, markdown, images })

      toast.dismiss(loadingToast)
      if (result.success) {
        toast.success(`${t('Chat exported to')} ${result.directory}`)
      } else {
        toast.error(`${t('Failed to export chat')}: ${result.error ?? ''}`)
      }
    } catch (error) {
      console.error('Failed to export chat:', error)
      toast.dismiss(loadingToast)
      toast.error(t('Failed to export chat'))
    } finally {
      setIsExporting(false)
    }
  }, [
    currentSessionId,
    messages,
    isExporting,
    resolveExportTitle,
    roleLabel,
    userEmoji,
    resolveModel,
    t
  ])

  // チャットを Word (.docx) にエクスポートするハンドラ（Markdown 版と同じ内容ルール）
  const handleExportWord = useCallback(async () => {
    if (!currentSessionId || messages.length === 0 || isExportingWord) return

    setIsExportingWord(true)
    const loadingToast = toast.loading(t('Exporting chat...'))
    try {
      const title = await resolveExportTitle()

      // リッチテキスト HTML を構築する（見出し・アバター・図表を埋め込む）
      const { html } = await buildChatHtml(title, messages, {
        rasterizeDrawio: (xml) =>
          drawioRasterizerRef.current?.rasterize(xml) ?? Promise.resolve(null),
        roleLabel,
        avatar: { userEmoji, resolveModel }
      })

      // ディスクに書き込む
      const result = await window.file.exportChatDocx({ title, html })

      toast.dismiss(loadingToast)
      if (result.success) {
        toast.success(`${t('Chat exported to')} ${result.directory}`)
      } else {
        toast.error(`${t('Failed to export chat')}: ${result.error ?? ''}`)
      }
    } catch (error) {
      console.error('Failed to export chat to Word:', error)
      toast.dismiss(loadingToast)
      toast.error(t('Failed to export chat'))
    } finally {
      setIsExportingWord(false)
    }
  }, [
    currentSessionId,
    messages,
    isExportingWord,
    resolveExportTitle,
    roleLabel,
    userEmoji,
    resolveModel,
    t
  ])

  // チャットを PDF にエクスポートするハンドラ（Markdown 版と同じ内容ルール）
  const handleExportPdf = useCallback(async () => {
    if (!currentSessionId || messages.length === 0 || isExportingPdf) return

    setIsExportingPdf(true)
    const loadingToast = toast.loading(t('Exporting chat...'))
    try {
      const title = await resolveExportTitle()

      // 印刷用の HTML を構築する（画像はすべてインライン化される）
      const { html } = await buildChatPdfHtml(title, messages, {
        rasterizeDrawio: (xml) =>
          drawioRasterizerRef.current?.rasterize(xml) ?? Promise.resolve(null),
        roleLabel,
        avatar: { userEmoji, resolveModel }
      })

      // main プロセスで PDF に印刷して書き込む
      const result = await window.file.exportChatPdf({ title, html })

      toast.dismiss(loadingToast)
      if (result.success) {
        toast.success(`${t('Chat exported to')} ${result.directory}`)
      } else {
        toast.error(`${t('Failed to export chat')}: ${result.error ?? ''}`)
      }
    } catch (error) {
      console.error('Failed to export chat to PDF:', error)
      toast.dismiss(loadingToast)
      toast.error(t('Failed to export chat'))
    } finally {
      setIsExportingPdf(false)
    }
  }, [
    currentSessionId,
    messages,
    isExportingPdf,
    resolveExportTitle,
    roleLabel,
    userEmoji,
    resolveModel,
    t
  ])

  // シナリオ選択ハンドラ
  const handleSelectScenario = useCallback((scenario: string) => {
    // テキストエリアに選択したシナリオを設定
    if (inputFormRef.current) {
      inputFormRef.current.setInputText(scenario)
    }
  }, [])

  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const DEFAULT_TEXTAREA_HEIGHT = 72 // Default height (3 lines * 24px)

  const [textareaHeight, setTextareaHeight] = useState(DEFAULT_TEXTAREA_HEIGHT)

  // Streaming auto-scroll: follows tool-use output, then stops when the answer's first line
  // reaches the top. The signature changes on every streamed update so the hook re-evaluates.
  const messageAreaRef = useRef<HTMLDivElement>(null)
  const lastMessage = messages[messages.length - 1]
  const lastTextBlock = lastMessage?.content?.find((c) => 'text' in c) as
    | { text?: string }
    | undefined
  const scrollSignature = `${messages.length}:${lastMessage?.content?.length ?? 0}:${lastTextBlock?.text?.length ?? 0}`
  useStreamingAutoScroll(messageAreaRef, { signature: scrollSignature, loading })

  const handleSessionSelect = (sessionId: string) => {
    setCurrentSessionId(sessionId)
  }

  // URLパラメータからプロンプトとエージェントを自動設定
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const promptFromUrl = searchParams.get('prompt')
    const agentFromUrl = searchParams.get('agent')

    if (promptFromUrl && inputFormRef.current) {
      // プロンプトをテキストエリアに設定
      inputFormRef.current.setInputText(decodeURIComponent(promptFromUrl))

      // 指定されたエージェントに切り替え
      if (agentFromUrl && agents.find((a) => a.id === agentFromUrl)) {
        setSelectedAgentId(agentFromUrl)
      }

      // URLパラメータをクリア（同じリンクを再度クリックした時の対応）
      const newUrl = window.location.pathname + window.location.hash
      window.history.replaceState({}, '', newUrl)
    }
  }, [location.search, agents, setSelectedAgentId])

  return (
    <React.Fragment>
      {/* Hidden DrawIO embed used to rasterize diagrams during markdown export */}
      <DrawioRasterizer ref={drawioRasterizerRef} />
      <div className="flex p-3 h-screen">
        {/* チャット履歴サイドパネル - 全高。ヘッダーより上（ウィンドウ最上部）から始まる */}
        <div
          className={`dark:bg-gray-900 flex-shrink-0 transition-all duration-300 ease-in-out ${
            isHistoryOpen ? 'w-96' : 'w-0'
          } overflow-y-auto overflow-x-hidden`}
        >
          {/* Fixed-width inner keeps content from reflowing while the panel
              width animates, so the chat column slides smoothly. */}
          <div className="w-96">
            <ChatHistory
              onSessionSelect={handleSessionSelect}
              currentSessionId={currentSessionId}
            />
          </div>
        </div>

        {/* チャット履歴トグルバー */}
        <div className="flex items-center">
          <Tooltip
            content={t(isHistoryOpen ? 'Hide chat history' : 'Show chat history')}
            placement="right"
            animation="duration-500"
          >
            <div
              onClick={() => setIsHistoryOpen(!isHistoryOpen)}
              className="w-4 h-16 dark:bg-gray-700 bg-gray-200 cursor-pointer flex items-center justify-center transition-colors duration-200 rounded-lg m-2"
            >
              <FiChevronRight
                className={`w-4 h-4 text-accent hover:text-accent-strong transition-transform duration-200 ${
                  isHistoryOpen ? 'rotate-180' : ''
                }`}
              />
            </div>
          </Tooltip>
        </div>

        {/* チャット列（ヘッダー + メインコンテンツ） - フレックス成長。履歴表示時に右へスライド */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* ヘッダー - 固定 */}
          <div className="flex justify-end items-center">
            <div className="flex items-center gap-2">
              {/* Only show TODO icon when there are messages */}
              {messages.length > 0 && (
                <FaListCheck
                  key={todoFlash?.nonce ?? 0}
                  className={`cursor-pointer ${
                    todoFlashColor
                      ? `${todoFlashColor} animate-todo-flash`
                      : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                  onClick={() => handleOpenTodoModal()}
                  title={t('View TODO List')}
                  size={16}
                />
              )}
              {messages.length > 0 && (
                <span
                  className="text-xs text-gray-400 font-medium cursor-pointer hover:text-gray-700 dark:hover:text-gray-300"
                  onClick={handleOpenTokenAnalyticsModal}
                  title={t('Conversation Cost')}
                >
                  {runningCost.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                  })}
                </span>
              )}
              <FiBarChart2
                className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                onClick={handleOpenTokenAnalyticsModal}
                title={t('View Token Analytics')}
                size={16}
              />
              <span
                className="text-xs text-gray-400 font-thin cursor-pointer hover:text-gray-700 dark:hover:text-gray-300"
                onClick={handleOpenSystemPromptModal}
              >
                SYSTEM_PROMPT
              </span>
            </div>
          </div>

          {/* Modals */}
          <SystemPromptModal
            isOpen={showSystemPromptModal}
            onClose={handleCloseSystemPromptModal}
            systemPrompt={systemPrompt}
          />
          <TokenAnalyticsModal
            isOpen={showTokenAnalyticsModal}
            onClose={handleCloseTokenAnalyticsModal}
            messages={messages}
            modelId={llm?.modelId || ''}
          />
          <TodoModal isOpen={showTodoModal} onClose={handleCloseTodoModal} />
          <ToolSettingModal isOpen={showToolSettingModal} onClose={handleCloseToolSettingModal} />
          <IgnoreSettingsModal
            isOpen={showIgnoreSettingsModal}
            onClose={handleCloseIgnoreFileModal}
            projectPath={projectPath}
          />

          {/* メインコンテンツエリア - フレックス成長 */}
          {/* pb-52 (13rem) reserves space for the fixed input form. */}
          <div className="flex flex-col flex-1 min-h-0 pb-52">
            {/* Adjusts the bottom padding of the message area based on the height of the text area */}
            <div
              ref={messageAreaRef}
              className="flex-1 overflow-y-auto mb-2"
              style={{
                // Additional padding is applied only when the text area grows larger
                // This ensures that as the text area gets taller, the bottom padding of the message area increases by the same amount
                paddingBottom: `${textareaHeight - DEFAULT_TEXTAREA_HEIGHT * 2}px`
              }}
            >
              {messages.length === 0 ? (
                <div className="flex flex-col pt-12 h-full w-full justify-center items-center content-center align-center gap-1">
                  <div className="flex flex-row gap-3 items-center mb-2">
                    <div className="bg-icon rounded-lg p-1.5 flex items-center justify-center">
                      <div className="h-6 w-6">
                        <img
                          src={AILogo}
                          className="h-full w-full object-contain"
                          alt="assistant"
                        />
                      </div>
                    </div>
                    <h1 className="text-lg font-bold dark:text-white">Agent Chat</h1>
                  </div>
                  <div className="text-gray-400">{t(currentAgent?.description ?? '')}</div>
                  {currentAgent && (
                    <ExampleScenarios
                      scenarios={currentScenarios}
                      onSelectScenario={handleSelectScenario}
                    />
                  )}
                </div>
              ) : (
                <div className="py-8">
                  <MessageList
                    messages={messages}
                    loading={loading}
                    reasoning={reasoning}
                    waitingForResponse={waitingForResponse}
                    timeoutCountdown={timeoutCountdown}
                    heartbeatCount={heartbeatCount}
                    deleteMessage={handleDeleteMessage}
                  />
                </div>
              )}
            </div>

            {/* 入力フォーム - 固定 */}
            <div className="mt-2 dark:border-gray-700 bg-white dark:bg-gray-800">
              <InputFormContainer
                ref={inputFormRef}
                loading={loading}
                projectPath={projectPath}
                sendMsgKey={sendMsgKey}
                onSubmit={onSubmit}
                onOpenToolSettings={handleOpenToolSettingModal}
                onSelectDirectory={selectDirectory}
                onOpenIgnoreModal={handleOpenIgnoreFileModal}
                onClearChat={handleClearChat}
                onExportChat={handleExportChat}
                isExporting={isExporting}
                onExportWord={handleExportWord}
                isExportingWord={isExportingWord}
                onExportPdf={handleExportPdf}
                isExportingPdf={isExportingPdf}
                onStopGeneration={stopGeneration}
                hasMessages={messages.length > 0}
                onHeightChange={setTextareaHeight}
                isHistoryOpen={isHistoryOpen}
              />
            </div>
          </div>
        </div>
      </div>
    </React.Fragment>
  )
}
