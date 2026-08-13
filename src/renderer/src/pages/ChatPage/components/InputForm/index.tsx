import React, { useState } from 'react'
import { AttachedImage, TextArea } from './TextArea'
import { ToolSettings } from './ToolSettings'
import { AttachmentsButton } from './AttachmentsButton'
import { DirectorySelector } from './DirectorySelector'
import { SendMsgKey } from '@/types/agent-chat'
import { FiStopCircle } from 'react-icons/fi'
import { TbMarkdown, TbMessagePlus } from 'react-icons/tb'
import { useTranslation } from 'react-i18next'
import { Tooltip } from 'flowbite-react'

type InputFormProps = {
  userInput: string
  loading: boolean
  projectPath?: string
  sendMsgKey?: SendMsgKey
  onSubmit: (input: string, attachedImages: AttachedImage[]) => void
  onChange: (input: string) => void
  onOpenToolSettings: () => void
  onSelectDirectory: () => void
  onOpenIgnoreModal: () => void
  onClearChat: () => void
  onExportChat?: () => void // Markdown エクスポートのハンドラ
  isExporting?: boolean
  onStopGeneration?: () => void // 停止ボタンのハンドラ
  hasMessages: boolean
  onHeightChange?: (height: number) => void // Text area height change handler
  isHistoryOpen?: boolean // Whether the chat history panel is expanded
}

export const InputForm: React.FC<InputFormProps> = ({
  userInput,
  loading,
  projectPath = '',
  sendMsgKey = 'Enter',
  onSubmit,
  onChange,
  onOpenToolSettings,
  onSelectDirectory,
  onOpenIgnoreModal,
  onClearChat,
  onExportChat,
  isExporting,
  onStopGeneration,
  hasMessages,
  onHeightChange,
  isHistoryOpen = false
}) => {
  const [isComposing, setIsComposing] = useState(false)
  const { t } = useTranslation()

  // The form is fixed-positioned (offset past the app nav sidebar at 5rem).
  // When the history panel (w-96 = 24rem) opens, shift its left edge to match
  // so the input slides right in step with the message area above it.
  return (
    <div
      className={`flex gap-2 fixed bottom-0 right-5 bottom-3 pt-3 transition-all duration-300 ease-in-out ${
        isHistoryOpen ? 'left-[29rem]' : 'left-[5rem]'
      }`}
    >
      <div className="relative w-full">
        <div className="flex justify-between mb-2">
          {/* left */}
          <div className="flex flex-col justify-end gap-2 mb-1">
            <div className="flex gap-4 items-center">
              <ToolSettings onOpenToolSettings={onOpenToolSettings} />
              <AttachmentsButton />
            </div>
            <DirectorySelector
              projectPath={projectPath}
              onSelectDirectory={onSelectDirectory}
              onOpenIgnoreModal={onOpenIgnoreModal}
            />
          </div>

          {/* right */}
          {hasMessages && (
            <div className="flex items-end mb-1 gap-2">
              {loading && onStopGeneration && (
                <Tooltip content={t('Stop generation')} placement="top" animation="duration-500">
                  <button
                    onClick={onStopGeneration}
                    className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors duration-200"
                  >
                    <FiStopCircle />
                  </button>
                </Tooltip>
              )}
              {onExportChat && (
                <Tooltip
                  content={t('Export chat to Markdown')}
                  placement="top"
                  animation="duration-500"
                >
                  <button
                    onClick={onExportChat}
                    disabled={isExporting}
                    className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <TbMarkdown />
                  </button>
                </Tooltip>
              )}
              <Tooltip content={t('New chat')} placement="top" animation="duration-500">
                <button
                  onClick={onClearChat}
                  className="p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100 transition-colors duration-200"
                >
                  <TbMessagePlus />
                </button>
              </Tooltip>
            </div>
          )}
        </div>

        <TextArea
          value={userInput}
          onChange={onChange}
          disabled={loading}
          onSubmit={(userInput, attachedImages) => onSubmit(userInput, attachedImages)}
          isComposing={isComposing}
          setIsComposing={setIsComposing}
          sendMsgKey={sendMsgKey}
          onHeightChange={onHeightChange}
        />
      </div>
    </div>
  )
}
