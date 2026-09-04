import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Modal } from 'flowbite-react'
import { FiAlertTriangle } from 'react-icons/fi'
import {
  getPendingHostApproval,
  HostApprovalRequest,
  resolveHostApproval,
  subscribeHostApproval
} from '../lib/hostCommandApproval'

/**
 * Confirmation for a command the agent wants to run on the user's own machine rather
 * than in the chat's Docker sandbox. Mounted once by ChatPage; it shows itself whenever
 * the approval broker has a pending request.
 */
export const HostCommandApprovalModal: React.FC = () => {
  const { t } = useTranslation()
  const [request, setRequest] = useState<HostApprovalRequest | null>(getPendingHostApproval())

  useEffect(() => subscribeHostApproval(() => setRequest(getPendingHostApproval())), [])

  return (
    <Modal
      show={!!request}
      onClose={() => resolveHostApproval('deny')}
      size="lg"
      dismissible={false}
    >
      <Modal.Header>
        <div className="flex items-center gap-2">
          <FiAlertTriangle className="text-amber-500" />
          {t('hostCommand.title')}
        </div>
      </Modal.Header>
      <Modal.Body>
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">{t('hostCommand.body')}</p>

          <div className="rounded-md bg-gray-100 dark:bg-gray-900 p-3 font-mono text-sm break-all">
            <div className="text-gray-900 dark:text-gray-100">{request?.command}</div>
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              {t('hostCommand.workingDirectory')}: {request?.cwd}
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">{t('hostCommand.note')}</p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <div className="flex w-full justify-end gap-2">
          <button
            onClick={() => resolveHostApproval('deny')}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {t('hostCommand.deny')}
          </button>
          <button
            onClick={() => resolveHostApproval('once')}
            className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700"
          >
            {t('hostCommand.allowOnce')}
          </button>
          <button
            onClick={() => resolveHostApproval('chat')}
            className="px-4 py-2 text-sm rounded-md bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-800"
          >
            {t('hostCommand.allowForChat')}
          </button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}
