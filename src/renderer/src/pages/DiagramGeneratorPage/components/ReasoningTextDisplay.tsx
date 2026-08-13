import { useState, useRef, memo } from 'react'
import { MdExpandMore } from 'react-icons/md'

type ReasoningTextDisplayProps = {
  text: string
}

// メモ化してpropsが変更されない限り再レンダリングしない
const ReasoningTextDisplayComponent = ({ text }: ReasoningTextDisplayProps) => {
  // 展開状態を管理するstate
  const [isExpanded, setIsExpanded] = useState(false)
  const textAreaRef = useRef<HTMLDivElement>(null)

  if (!text) return null

  return (
    <div>
      {/* クリック可能なヘッダー部分 */}
      <div
        className="flex justify-center items-center space-x-1 cursor-pointer mb-1"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-xs font-medium bg-gradient-to-r from-cyan-500 via-blue-500 to-cyan-400 bg-[length:200%_100%] animate-gradient-x bg-clip-text text-transparent">
          Reasoning
        </span>
        <MdExpandMore
          className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''} text-gray-500 text-xs`}
          size={14}
        />
      </div>

      {/* 展開可能なコンテンツ部分 */}
      <div
        className={`transition-all duration-300 rounded-lg overflow-hidden ${
          isExpanded
            ? 'max-h-[30rem] opacity-100 bg-gray-50/50 dark:bg-gray-800/30 border border-gray-200 dark:border-gray-700 backdrop-blur-sm'
            : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 py-3">
          <div
            ref={textAreaRef}
            className="pb-5 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap font-light overflow-y-auto pr-2 max-h-[25rem] break-words overflow-wrap-anywhere"
          >
            {text || 'Thinking...'}
          </div>
        </div>
      </div>
    </div>
  )
}

// displayNameを設定してESLintエラーを解消
export const ReasoningTextDisplay = memo(ReasoningTextDisplayComponent)
ReasoningTextDisplay.displayName = 'ReasoningTextDisplay'
