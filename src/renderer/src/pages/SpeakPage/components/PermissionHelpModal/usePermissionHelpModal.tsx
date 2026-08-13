import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiCloseLine } from 'react-icons/ri'
import { BsTerminal } from 'react-icons/bs'

export const usePermissionHelpModal = () => {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useTranslation()

  const openModal = () => setIsOpen(true)
  const closeModal = () => setIsOpen(false)

  const PermissionHelpModal = () => {
    // Handle ESC key press to close the modal
    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal()
      }
    }

    return isOpen ? (
      <div className="fixed inset-0 z-50 overflow-y-auto" onKeyDown={handleKeyDown}>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={closeModal}></div>

        {/* Modal */}
        <div className="flex items-center justify-center min-h-screen p-4">
          <div
            className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={closeModal}
              aria-label={t('close')}
            >
              <RiCloseLine size={24} />
            </button>

            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold dark:text-white">{t('permissionHelp.title')}</h2>
              <p className="mt-1 text-gray-600 dark:text-gray-400">
                {t('permissionHelp.description')}
              </p>
            </div>

            {/* Content */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-4 dark:text-white">
                {t('permissionHelp.commandTitle')}
              </h3>

              <p className="text-gray-700 dark:text-gray-300 mb-4">
                {t('permissionHelp.commandDescription')}
              </p>

              {/* Command block */}
              <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 mb-4">
                <div className="flex items-center mb-2">
                  <BsTerminal className="w-4 h-4 text-gray-400 mr-2" />
                  <span className="text-gray-400 text-sm font-medium">Terminal</span>
                </div>
                <code className="text-green-400 font-mono text-sm block break-all">
                  sudo codesign --force --deep --sign - &quot;/Applications/Bedrock
                  Engineer.app&quot;
                </code>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start">
                  <svg
                    className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">
                      {t('permissionHelp.noteTitle')}
                    </h4>
                    <p className="text-sm text-blue-700 dark:text-blue-400">
                      {t('permissionHelp.noteDescription')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end mt-6">
              <button
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-600 dark:hover:bg-blue-700"
                onClick={closeModal}
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null
  }

  return {
    PermissionHelpModal,
    openModal,
    closeModal,
    isOpen
  }
}
