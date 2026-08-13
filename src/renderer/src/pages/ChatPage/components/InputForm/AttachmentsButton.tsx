import React from 'react'
import { FcOpenedFolder } from 'react-icons/fc'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'

/**
 * Button that opens the project's attachments folder
 * (.bedrock-engineer/attachments) in the OS file manager so the user can
 * browse or remove documents dropped into the chat.
 */
export const AttachmentsButton: React.FC = () => {
  const { t } = useTranslation()

  const handleOpen = async () => {
    const result = await window.file.openAttachmentsDirectory()
    if (!result.success) {
      toast.error(t('attachments.openFailed', { error: result.error || 'unknown' }))
    }
  }

  return (
    <label
      onClick={handleOpen}
      title={t('attachments.tooltip')}
      className="block text-sm font-medium text-gray-900 dark:text-white cursor-pointer hover:text-gray-500"
    >
      <div className="flex gap-2 items-center">
        <FcOpenedFolder className="text-lg" />
        <span>{t('attachments.label')}</span>
      </div>
    </label>
  )
}
