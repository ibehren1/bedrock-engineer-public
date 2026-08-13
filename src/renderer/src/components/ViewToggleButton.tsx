import React from 'react'
import { motion } from 'framer-motion'
import { HiMicrophone, HiChatBubbleLeftRight } from 'react-icons/hi2'

interface ViewToggleButtonProps {
  isDetailView: boolean
  onToggle: (isDetailView: boolean) => void
  className?: string
}

export const ViewToggleButton: React.FC<ViewToggleButtonProps> = ({
  isDetailView,
  onToggle,
  className = ''
}) => {
  return (
    <div
      className={`
        relative inline-flex items-center
        bg-gray-100 dark:bg-gray-800
        rounded p-0.5
        border border-gray-200 dark:border-gray-700
        cursor-pointer
        ${className}
      `}
    >
      {/* アニメーション背景 */}
      <motion.div
        className="absolute top-0.5 h-5 w-8 bg-white/60 dark:bg-gray-600/60 rounded shadow-sm"
        animate={{
          x: isDetailView ? 32 : 0
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
          duration: 0.3
        }}
      />

      {/* SIMPLE ボタン (マイクアイコン) */}
      <button
        onClick={() => onToggle(false)}
        className={`
          relative z-10 flex items-center justify-center
          w-8 h-5 rounded
          transition-colors duration-200
          ${
            !isDetailView
              ? 'text-gray-700 dark:text-gray-200'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
          }
        `}
        title="Switch to Simple View"
      >
        <HiMicrophone size={12} />
      </button>

      {/* DETAIL ボタン (チャットアイコン) */}
      <button
        onClick={() => onToggle(true)}
        className={`
          relative z-10 flex items-center justify-center
          w-8 h-5 rounded
          transition-colors duration-200
          ${
            isDetailView
              ? 'text-gray-700 dark:text-gray-200'
              : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
          }
        `}
        title="Switch to Detail View"
      >
        <HiChatBubbleLeftRight size={12} />
      </button>
    </div>
  )
}
