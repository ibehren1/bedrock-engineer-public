import React from 'react'
import { useTranslation } from 'react-i18next'
import { SettingSection } from '../SettingSection'
import { SettingInput } from '../SettingInput'
import { SettingSelect } from '../SettingSelect'
import { FaShieldAlt } from 'react-icons/fa'

interface GuardrailSettingsProps {
  guardrailSettings: {
    enabled: boolean
    guardrailIdentifier: string
    guardrailVersion: string
    trace: 'enabled' | 'disabled'
  }
  onUpdateGuardrailSettings: (
    settings: Partial<GuardrailSettingsProps['guardrailSettings']>
  ) => void
}

export const GuardrailSettings: React.FC<GuardrailSettingsProps> = ({
  guardrailSettings,
  onUpdateGuardrailSettings
}) => {
  const { t } = useTranslation()

  const traceOptions = [
    { value: 'enabled', label: t('Enabled') },
    { value: 'disabled', label: t('Disabled') }
  ]

  return (
    <SettingSection title={t('Amazon Bedrock Guardrails')} icon={FaShieldAlt}>
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300
                focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800
                focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              checked={guardrailSettings.enabled}
              onChange={(e) => onUpdateGuardrailSettings({ enabled: e.target.checked })}
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              {t('Enable Guardrails')}
            </span>
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t(
              'When enabled, guardrails will be applied to all model interactions to filter harmful content.'
            )}
          </p>
        </div>

        {guardrailSettings.enabled && (
          <>
            <SettingInput
              label={t('Guardrail Identifier')}
              type="text"
              placeholder="gr-xxxxxxxxxx"
              value={guardrailSettings.guardrailIdentifier}
              onChange={(e) => onUpdateGuardrailSettings({ guardrailIdentifier: e.target.value })}
              description={t('The ID of the guardrail you want to use')}
            />

            <SettingInput
              label={t('Guardrail Version')}
              type="text"
              placeholder="DRAFT"
              value={guardrailSettings.guardrailVersion}
              onChange={(e) => onUpdateGuardrailSettings({ guardrailVersion: e.target.value })}
              description={t('The version of the guardrail (DRAFT or a version number)')}
            />

            <SettingSelect
              label={t('Trace')}
              value={guardrailSettings.trace}
              options={traceOptions}
              onChange={(e) =>
                onUpdateGuardrailSettings({ trace: e.target.value as 'enabled' | 'disabled' })
              }
            />
          </>
        )}
      </div>
    </SettingSection>
  )
}
