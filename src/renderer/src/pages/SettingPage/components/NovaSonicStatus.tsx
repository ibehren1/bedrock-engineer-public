import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BsCheckCircle, BsXCircle, BsArrowClockwise, BsExclamationCircle } from 'react-icons/bs'
import { checkNovaSonicRegionSupport, type RegionCheckResult } from '@renderer/lib/api/novaSonic'

interface NovaSonicStatusProps {
  currentRegion: string
}

export const NovaSonicStatus: React.FC<NovaSonicStatusProps> = ({ currentRegion }) => {
  const { t } = useTranslation()
  const [regionCheck, setRegionCheck] = useState<RegionCheckResult | null>(null)
  const [loading, setLoading] = useState(true)

  const checkRegionStatus = async () => {
    try {
      setLoading(true)
      const result = await checkNovaSonicRegionSupport(currentRegion)
      setRegionCheck(result)
    } catch (error) {
      console.error('Failed to check Nova Sonic region support:', error)
      setRegionCheck({
        isSupported: false,
        currentRegion,
        supportedRegions: ['us-east-1', 'us-west-2', 'ap-northeast-1', 'eu-north-1'],
        error: 'Failed to check region support'
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkRegionStatus()
  }, [currentRegion])

  const getStatusIcon = () => {
    if (loading) {
      return <BsArrowClockwise className="w-4 h-4 text-ink-muted animate-spin" />
    }

    if (regionCheck?.isSupported) {
      return <BsCheckCircle className="w-4 h-4 text-success" />
    }

    return <BsXCircle className="w-4 h-4 text-danger" />
  }

  const getStatusText = () => {
    if (loading) {
      return t('settings.novaSonic.checking', 'Checking availability...')
    }

    if (regionCheck?.isSupported) {
      return t('settings.novaSonic.available', 'Available')
    }

    return t('settings.novaSonic.notAvailable', 'Not Available')
  }

  const getStatusColor = () => {
    if (loading) return 'text-ink-muted'
    if (regionCheck?.isSupported) return 'text-success'
    return 'text-danger'
  }

  return (
    <div className="bg-surface-2 rounded-container p-2.5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-ink">
          {t('settings.novaSonic.title', 'Voice Chat (Nova Sonic)')}
        </h4>
        <button
          onClick={checkRegionStatus}
          disabled={loading}
          className="p-1 text-ink-muted hover:text-ink disabled:opacity-50"
          title={t('settings.novaSonic.refresh', 'Refresh status')}
        >
          <BsArrowClockwise className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex items-center space-x-2 mb-2">
        {getStatusIcon()}
        <span className={`text-sm font-medium ${getStatusColor()}`}>{getStatusText()}</span>
      </div>

      {regionCheck && !loading && (
        <>
          <div className="text-xs text-ink-muted mb-2">
            {t('settings.novaSonic.currentRegion', 'Current region: {{region}}', {
              region: regionCheck.currentRegion
            })}
          </div>

          {!regionCheck.isSupported && (
            <div className="space-y-2">
              <div className="flex items-start space-x-2 p-2 bg-warning-soft rounded-control">
                <BsExclamationCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
                <div className="text-xs text-warning">
                  {t('settings.novaSonic.supportedRegions', 'Supported regions: {{regions}}', {
                    regions: regionCheck.supportedRegions.join(', ')
                  })}
                </div>
              </div>
              {regionCheck.error && (
                <div className="text-xs text-danger bg-danger-soft p-2 rounded-control">
                  {regionCheck.error}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
