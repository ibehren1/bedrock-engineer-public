import React from 'react'
import { useTranslation } from 'react-i18next'
import { BsExclamationTriangle, BsGear, BsX } from 'react-icons/bs'

interface RegionWarningBannerProps {
  currentRegion: string
  supportedRegions: readonly string[]
  onDismiss: () => void
  onOpenSettings: () => void
}

export const RegionWarningBanner: React.FC<RegionWarningBannerProps> = ({
  currentRegion,
  supportedRegions,
  onDismiss,
  onOpenSettings
}) => {
  const { t } = useTranslation()

  return (
    <div className="bg-warning-soft border border-warning rounded-container p-2.5 mb-4">
      <div className="flex items-start space-x-3">
        {/* Warning Icon */}
        <BsExclamationTriangle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-warning">
            {t('voiceChat.regionWarning.title', 'Voice Chat Not Available')}
          </h3>
          <p className="mt-1 text-sm text-warning">
            {t('voiceChat.regionWarning.message', {
              currentRegion,
              supportedRegions: supportedRegions.join(', '),
              defaultValue: `Voice Chat (Nova Sonic) is not available in the current region (${currentRegion}). Please switch to a supported region: ${supportedRegions.join(', ')}.`
            })}
          </p>

          {/* Action Buttons */}
          <div className="mt-3 flex items-center space-x-3">
            <button
              onClick={onOpenSettings}
              className="inline-flex items-center space-x-1 text-sm font-medium text-warning hover:text-warning-strong transition-colors"
            >
              <BsGear className="w-4 h-4" />
              <span>{t('voiceChat.regionWarning.openSettings', 'Open Settings')}</span>
            </button>
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-warning hover:text-warning-strong transition-colors"
          title={t('common.dismiss', 'Dismiss')}
        >
          <BsX className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
