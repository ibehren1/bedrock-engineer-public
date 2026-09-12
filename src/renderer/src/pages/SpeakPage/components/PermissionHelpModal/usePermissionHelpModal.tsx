import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RiCloseLine } from 'react-icons/ri'
import { BsTerminal } from 'react-icons/bs'
import { Button } from '@renderer/components/ui'

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
        <div className="flex items-center justify-center min-h-screen p-2.5">
          <div
            className="relative w-full max-w-2xl bg-surface rounded-container shadow-lg p-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              className="absolute top-3 right-3 text-ink-muted hover:text-ink"
              onClick={closeModal}
              aria-label={t('close')}
            >
              <RiCloseLine size={16} />
            </button>

            {/* Header */}
            <div className="mb-3">
              <h2 className="text-title text-ink">{t('permissionHelp.title')}</h2>
              <p className="mt-1 text-ink-muted">{t('permissionHelp.description')}</p>
            </div>

            {/* Content */}
            <div className="mb-3">
              <h3 className="text-heading mb-2 text-ink">{t('permissionHelp.commandTitle')}</h3>

              <p className="text-ink mb-2">{t('permissionHelp.commandDescription')}</p>

              {/* Command block */}
              <div className="bg-sunken border border-subtle rounded-container p-2.5 mb-2">
                <div className="flex items-center mb-2">
                  <BsTerminal className="w-4 h-4 text-ink-faint mr-2" />
                  <span className="text-ink-faint text-sm font-medium">Terminal</span>
                </div>
                <code className="text-success font-mono text-sm block break-all">
                  sudo codesign --force --deep --sign - &quot;/Applications/Bedrock
                  Engineer.app&quot;
                </code>
              </div>

              <div className="bg-accent-tint border border-accent rounded-container p-2.5">
                <div className="flex items-start">
                  <svg
                    className="w-4 h-4 text-accent mt-0.5 mr-2 flex-shrink-0"
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
                    <h4 className="text-sm font-medium text-accent mb-1">
                      {t('permissionHelp.noteTitle')}
                    </h4>
                    <p className="text-sm text-accent">{t('permissionHelp.noteDescription')}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end mt-3">
              <Button variant="primary" onClick={closeModal}>
                {t('close')}
              </Button>
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
