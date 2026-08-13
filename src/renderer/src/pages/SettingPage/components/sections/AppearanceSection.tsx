import React from 'react'
import { useTranslation } from 'react-i18next'
import { FiSun } from 'react-icons/fi'
import { SettingSection } from '../SettingSection'
import { SettingSelect } from '../SettingSelect'
import { useTheme, type AppTheme } from '@renderer/hooks/useTheme'

export const AppearanceSection: React.FC = () => {
  const { t } = useTranslation()
  const { appTheme, setAppTheme } = useTheme()

  const themeOptions = [
    { value: 'light', label: t('appearance.themes.light') },
    { value: 'dim', label: t('appearance.themes.dim') },
    { value: 'dark', label: t('appearance.themes.dark') },
    { value: 'system', label: t('appearance.themes.system') }
  ]

  return (
    <SettingSection title={t('appearance.title')} icon={FiSun}>
      <SettingSelect
        label={t('appearance.theme')}
        description={t('appearance.description')}
        value={appTheme}
        options={themeOptions}
        onChange={(e) => setAppTheme(e.target.value as AppTheme)}
      />
    </SettingSection>
  )
}
