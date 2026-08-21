import React, { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { FcBusinessman } from 'react-icons/fc'
import { LiaUserCircleSolid } from 'react-icons/lia'
import EmojiPicker, { EmojiStyle, Theme, type EmojiClickData } from 'emoji-picker-react'
import { SettingSection } from '../SettingSection'
import useSetting from '@renderer/hooks/useSetting'
import { useTheme } from '@renderer/hooks/useTheme'

export const UserAvatarSection: React.FC = () => {
  const { t } = useTranslation()
  const { userEmoji, setUserEmoji, userName, setUserName } = useSetting()
  const { isDarkMode } = useTheme()
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close the picker when clicking outside of it.
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    setUserEmoji(emojiData.emoji)
    setIsPickerOpen(false)
  }

  return (
    <SettingSection
      title={t('userAvatar.title')}
      description={t('userAvatar.description')}
      icon={FcBusinessman}
    >
      <div className="flex items-center gap-3" ref={containerRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsPickerOpen((open) => !open)}
            className="flex items-center justify-center w-12 h-12 rounded-full border border-gray-300
              dark:border-gray-600 bg-white dark:bg-gray-700 hover:border-blue-500 dark:hover:border-blue-400
              transition-colors"
            aria-label={t('userAvatar.choose')}
          >
            {userEmoji ? (
              <span className="text-2xl leading-none" role="img" aria-label="user avatar">
                {userEmoji}
              </span>
            ) : (
              <LiaUserCircleSolid className="h-7 w-7 text-gray-600 dark:text-gray-300" />
            )}
          </button>

          {isPickerOpen && (
            <div className="absolute z-30 mt-2 left-0">
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                theme={isDarkMode ? Theme.DARK : Theme.LIGHT}
                emojiStyle={EmojiStyle.NATIVE}
                lazyLoadEmojis
                width={320}
                height={400}
              />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {userEmoji ? t('userAvatar.current') : t('userAvatar.usingDefault')}
          </span>
          {userEmoji && (
            <button
              type="button"
              onClick={() => setUserEmoji('')}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline text-left"
            >
              {t('userAvatar.reset')}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 mt-4">
        <label
          htmlFor="user-name-input"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('userName.title')}
        </label>
        <p className="text-xs text-gray-500 dark:text-gray-400">{t('userName.description')}</p>
        <input
          id="user-name-input"
          type="text"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          placeholder={t('userName.placeholder')}
          className="mt-1 w-full max-w-sm rounded-lg border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100
            focus:border-blue-500 focus:ring-blue-500 dark:focus:border-blue-400"
        />
      </div>
    </SettingSection>
  )
}
