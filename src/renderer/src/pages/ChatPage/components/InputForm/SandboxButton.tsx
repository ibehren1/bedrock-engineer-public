import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaDocker } from 'react-icons/fa'
import { FiFolder, FiPlay, FiSquare, FiTrash2 } from 'react-icons/fi'
import type { ChatSandboxStatus } from '../../hooks/useChatSandbox'
import { folderName } from '../../lib/folderName'

type SandboxButtonProps = {
  status: ChatSandboxStatus
  isBusy: boolean
  onStop: () => void
  onStart: () => void
  onRemove: (deleteData: boolean) => void
  onOpenFolder: () => void
}

/**
 * Docker whale button for the chat toolbar, shown only when the current chat has a
 * sandbox. Opens upward because the toolbar sits at the bottom of the window — same
 * approach as ThinkingModeSelector.
 */
export const SandboxButton: React.FC<SandboxButtonProps> = ({
  status,
  isBusy,
  onStop,
  onStart,
  onRemove,
  onOpenFolder
}) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isRunning = status.state === 'running' || status.state === 'partial'

  const statusLabel = () => {
    switch (status.state) {
      case 'running':
        return t('dockerSandbox.menu.stateRunning')
      case 'partial':
        return t('dockerSandbox.menu.statePartial')
      default:
        return t('dockerSandbox.menu.stateStopped')
    }
  }

  const publishedPorts = (status.metadata?.services ?? []).flatMap((service) =>
    service.ports.map((port) => ({ service: service.name, ...port }))
  )

  const act = (action: () => void) => {
    setIsOpen(false)
    action()
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((open) => !open)}
        disabled={isBusy}
        title={t('dockerSandbox.menu.title')}
        aria-label={t('dockerSandbox.menu.title')}
        className={`p-2 rounded-full hover:bg-white dark:hover:bg-white/20 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${
          isRunning ? 'text-[#2496ED]' : 'text-gray-400'
        }`}
      >
        <FaDocker className={isBusy ? 'animate-pulse' : ''} />
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 w-72 bottom-full mb-1 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
          <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${isRunning ? 'bg-green-500' : 'bg-gray-400'}`}
              />
              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {t('dockerSandbox.menu.title')}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{statusLabel()}</span>
            </div>

            {status.metadata?.directory && (
              <p
                className="mt-1 text-xs font-mono text-gray-500 dark:text-gray-400 truncate"
                title={status.metadata.directory}
              >
                {folderName(status.metadata.directory)}
              </p>
            )}

            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {(status.metadata?.services ?? []).map((service) => service.name).join(', ') || '—'}
            </p>

            {publishedPorts.length > 0 && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('dockerSandbox.menu.ports')}:{' '}
                {publishedPorts.map((port) => `${port.host}→${port.container}`).join(', ')}
              </p>
            )}
          </div>

          <button
            onClick={() => act(onOpenFolder)}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
          >
            <FiFolder className="w-4 h-4" />
            {t('dockerSandbox.menu.openFolder')}
          </button>

          {isRunning ? (
            <button
              onClick={() => act(onStop)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
            >
              <FiSquare className="w-4 h-4" />
              {t('dockerSandbox.menu.stop')}
            </button>
          ) : (
            <button
              onClick={() => act(onStart)}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
            >
              <FiPlay className="w-4 h-4" />
              {t('dockerSandbox.menu.start')}
            </button>
          )}

          <button
            onClick={() => {
              if (window.confirm(t('dockerSandbox.menu.confirmRemove'))) {
                act(() => onRemove(false))
              }
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
          >
            <FiTrash2 className="w-4 h-4" />
            {t('dockerSandbox.menu.remove')}
          </button>

          <button
            onClick={() => {
              if (window.confirm(t('dockerSandbox.menu.confirmRemoveWithData'))) {
                act(() => onRemove(true))
              }
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-2"
          >
            <FiTrash2 className="w-4 h-4" />
            {t('dockerSandbox.menu.removeWithData')}
          </button>
        </div>
      )}
    </div>
  )
}
