import React from 'react'
import { useTranslation } from 'react-i18next'

export const ThinkToolSettingForm: React.FC = () => {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">
          {t('Think Tool')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t(
            'The think tool gives the AI a dedicated space to reason through complex problems during a conversation, without changing data or fetching new information.'
          )}
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-md">
        <h5 className="font-medium mb-2">{t('How to use')}</h5>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          {t(
            'The think tool provides a dedicated space for the AI to stop and think during complex tasks. It helps the AI analyze information, plan next steps, and make better decisions without changing any data or fetching new information. Especially useful for multi-step problems and policy compliance.'
          )}
        </p>
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {t(
            'Especially useful for multi-step problems and policy compliance. The AI will automatically use this tool when needed for complex reasoning.'
          )}
        </p>
      </div>
    </div>
  )
}
