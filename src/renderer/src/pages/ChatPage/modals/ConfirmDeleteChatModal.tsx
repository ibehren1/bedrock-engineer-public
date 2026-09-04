import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from 'flowbite-react'
import { FaDocker } from 'react-icons/fa'

export type DeleteChatScope = 'single' | 'selected' | 'all'

export interface DeleteChatRequest {
  scope: DeleteChatScope
  sessionIds: string[]
  /** True when at least one target chat has a Docker sandbox on disk. */
  hasSandbox: boolean
}

type ConfirmDeleteChatModalProps = {
  request: DeleteChatRequest | null
  onCancel: () => void
  onConfirm: (deleteSandboxData: boolean) => void
}

/**
 * Delete confirmation for chats. Replaces window.confirm because a sandbox needs an extra
 * choice — whether to also delete the data folder the agent wrote to — and native confirm
 * dialogs cannot carry a checkbox.
 */
export const ConfirmDeleteChatModal: React.FC<ConfirmDeleteChatModalProps> = ({
  request,
  onCancel,
  onConfirm
}) => {
  const { t } = useTranslation()
  const [deleteSandboxData, setDeleteSandboxData] = useState(false)

  // Default back to keeping data every time the dialog opens, so a previous
  // "delete everything" choice can't silently apply to the next chat.
  useEffect(() => {
    if (request) setDeleteSandboxData(false)
  }, [request])

  const message = () => {
    if (!request) return ''
    switch (request.scope) {
      case 'all':
        return t('deleteChat.confirmAll')
      case 'selected':
        return t('deleteChat.confirmSelected', { count: request.sessionIds.length })
      default:
        return t('deleteChat.confirmSingle')
    }
  }

  return (
    <Modal show={!!request} onClose={onCancel} size="md">
      <Modal.Header>{t('deleteChat.title')}</Modal.Header>
      <Modal.Body>
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">{message()}</p>

          {request?.hasSandbox && (
            <div className="rounded-md bg-gray-100 dark:bg-gray-900 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <FaDocker className="text-[#2496ED]" />
                {t('deleteChat.sandboxNotice')}
              </div>

              <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deleteSandboxData}
                  onChange={(e) => setDeleteSandboxData(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
                />
                <span>
                  {t('deleteChat.deleteSandboxData')}
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {t('deleteChat.deleteSandboxDataHint')}
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <div className="flex w-full justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t('deleteChat.cancel')}
          </button>
          <button
            onClick={() => onConfirm(deleteSandboxData)}
            className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700"
          >
            {t('deleteChat.delete')}
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}
