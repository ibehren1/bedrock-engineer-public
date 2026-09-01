import React from 'react'
import { useTranslation } from 'react-i18next'
import { FcElectronics } from 'react-icons/fc'
import { useSettings } from '@renderer/contexts/SettingsContext'
import { SettingSection } from '../SettingSection'
import { NovaSonicStatus } from '../NovaSonicStatus'

export const VoiceChatRegionSection: React.FC = () => {
  const { t } = useTranslation()
  const { awsRegion } = useSettings()

  return (
    <SettingSection title={t('Voice Chat Status')} icon={FcElectronics}>
      <NovaSonicStatus currentRegion={awsRegion} />
    </SettingSection>
  )
}
