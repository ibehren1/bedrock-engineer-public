import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'

interface Scenario {
  title: string
  content: string
}

interface SampleTextCarouselProps {
  scenarios: Scenario[]
  isVisible: boolean
  className?: string
}

export const SampleTextCarousel: React.FC<SampleTextCarouselProps> = ({
  scenarios,
  isVisible,
  className = ''
}) => {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(0)

  // Filter out scenarios with empty titles
  const validScenarios = scenarios.filter((scenario) => scenario.content && scenario.content.trim())

  // Auto-switch scenarios every 3 seconds
  useEffect(() => {
    if (!isVisible || validScenarios.length <= 1) {
      return
    }

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % validScenarios.length)
    }, 6000) // 6 seconds

    return () => clearInterval(interval)
  }, [isVisible, validScenarios.length])

  // Reset index when scenarios change
  useEffect(() => {
    setCurrentIndex(0)
  }, [scenarios])

  // Don't render if not visible or no valid scenarios
  if (!isVisible || validScenarios.length === 0) {
    return null
  }

  return (
    <div className={`text-center space-y-3 ${className}`}>
      {/* Header text */}
      <div className="space-y-1">
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
          {t('Try talking like this')}
        </p>
        {/* Notice text */}
        <p className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">
          {t('Nova Sonic currently supports English only')}
        </p>
      </div>

      {/* Scenario text */}
      <div className="min-h-[3rem] flex items-center justify-center">
        <p className="text-base text-gray-700 dark:text-gray-300 font-normal max-w-md leading-relaxed">
          &ldquo;{validScenarios[currentIndex]?.content}&rdquo;
        </p>
      </div>

      {/* Progress indicators */}
      {validScenarios.length > 1 && (
        <div className="flex justify-center space-x-1 mt-3">
          {validScenarios.map((_, index) => (
            <div
              key={index}
              className={`w-1.5 h-1.5 rounded-full ${
                index === currentIndex
                  ? 'bg-blue-500 dark:bg-blue-400'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
