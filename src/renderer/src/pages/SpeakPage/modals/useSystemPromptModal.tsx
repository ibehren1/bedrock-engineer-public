import React, { useState } from 'react'
import MD from '@renderer/components/Markdown/MD'
import { Modal } from 'flowbite-react'
import { useTranslation } from 'react-i18next'

interface SystemPromptModalProps {
  isOpen: boolean
  onClose: () => void
  systemPrompt: string
  onSystemPromptChange: (prompt: string) => void
  isConnected: boolean
}

export const useSystemPromptModal = () => {
  const [show, setShow] = useState(false)
  const handleOpen = () => {
    setShow(true)
  }
  const handleClose = () => {
    setShow(false)
  }

  return {
    show: show,
    handleOpen: handleOpen,
    handleClose: handleClose,
    SystemPromptModal: SystemPromptModal
  }
}

const SystemPromptModal = React.memo(
  ({
    isOpen,
    onClose,
    systemPrompt,
    onSystemPromptChange,
    isConnected
  }: SystemPromptModalProps) => {
    const { t } = useTranslation()
    const [editedPrompt, setEditedPrompt] = useState(systemPrompt)

    React.useEffect(() => {
      setEditedPrompt(systemPrompt)
    }, [systemPrompt])

    const handleSave = () => {
      onSystemPromptChange(editedPrompt)
      onClose()
    }

    if (!isOpen) return null

    return (
      <Modal dismissible show={isOpen} onClose={onClose} size="7xl">
        <Modal.Header>SYSTEM PROMPT</Modal.Header>
        <Modal.Body className="text-ink">
          {isConnected ? (
            <div>
              <p className="mb-4 text-sm text-ink-muted">
                {t('Disconnect to edit the system prompt')}. {t('Current prompt')}:
              </p>
              <MD>{systemPrompt}</MD>
            </div>
          ) : (
            <div>
              <textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                className="w-full h-64 px-3 py-2 text-sm border border-strong rounded-control bg-surface text-ink focus:ring-2 focus:ring-accent focus:border-accent"
                placeholder={t('Enter system prompt for the AI assistant...')}
              />
              <p className="mt-2 text-xs text-ink-muted">
                {t('This prompt will be sent when you connect to start the conversation')}
              </p>
            </div>
          )}
        </Modal.Body>
        {!isConnected && (
          <Modal.Footer>
            <div className="flex justify-end space-x-2">
              <button
                onClick={onClose}
                className="px-2.5 py-1 text-sm font-medium text-ink bg-surface border border-strong rounded-control hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleSave}
                className="px-2.5 py-1 text-sm font-medium text-accent-fg bg-accent border border-transparent rounded-control hover:bg-accent-strong focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent"
              >
                {t('Save')}
              </button>
            </div>
          </Modal.Footer>
        )}
      </Modal>
    )
  }
)

SystemPromptModal.displayName = 'SystemPromptModal'
