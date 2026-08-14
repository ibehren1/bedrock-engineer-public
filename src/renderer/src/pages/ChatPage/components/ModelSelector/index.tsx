import React, { useState, useRef, useEffect } from 'react'
import { LLM } from '@/types/llm'
import { useSettings } from '@renderer/contexts/SettingsContext'
import { PricingCalculator } from '@common/models/pricing'
import { FiChevronDown } from 'react-icons/fi'
import { getModelIcon } from '@renderer/components/ModelIcon'

type ModelSelectorProps = {
  openable: boolean
  value?: string // 外部からのモデルID指定
  onChange?: (modelId: string) => void // 外部への変更通知
  className?: string // 追加のスタイリング
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  openable,
  value,
  onChange,
  className
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { currentLLM, updateLLM, availableModels, visibleModels } = useSettings()

  // 外部から値が指定されている場合はそれを使用、そうでなければcurrentLLMを使用
  const selectedModelId = value || currentLLM.modelId
  const selectedModel =
    availableModels.find((model) => model.modelId === selectedModelId) || currentLLM

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleModelSelect = (model: LLM) => {
    if (onChange) {
      // 外部制御モード：onChangeコールバックを呼び出し
      onChange(model.modelId)
    } else {
      // デフォルトモード：設定を更新
      updateLLM(model)
    }
    setIsOpen(false)
  }

  const modelColors = {
    icon: 'text-gray-600 dark:text-gray-400',
    hover: 'hover:bg-gray-50 dark:hover:bg-gray-800'
  }

  // Pricing stored in the model config is per 1,000 tokens; display it per
  // 1,000,000 tokens to match AWS Bedrock's published pricing convention.
  const getModelPricingLabel = (modelId: string): string | null => {
    const pricing = new PricingCalculator(modelId).getPricing()
    if (!pricing) return null
    const perMillion = (perThousand: number) =>
      (perThousand * 1000).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    return `${perMillion(pricing.input)} in / ${perMillion(pricing.output)} out per 1M tokens`
  }

  return (
    <div
      className={`justify-start flex items-center relative ${className || ''}`}
      ref={dropdownRef}
    >
      <div className="relative">
        {isOpen && (
          <div
            className="absolute z-20 w-[25rem] bottom-full mb-1 bg-white dark:bg-gray-900 rounded-lg shadow-lg
            border border-gray-200 dark:border-gray-700 py-2 px-2 max-h-[40vh] overflow-y-auto"
          >
            {visibleModels.map((model: LLM) => {
              const isInferenceProfile = model.isInferenceProfile || false
              return (
                <div
                  key={model.modelId}
                  onClick={() => handleModelSelect(model)}
                  className={`
                    flex items-center gap-4 px-3 py-2.5 cursor-pointer
                    ${model.modelId === selectedModelId ? 'bg-gray-50 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'}
                    ${modelColors.hover}
                    transition-colors rounded-md
                  `}
                  title={
                    isInferenceProfile
                      ? `Application Inference Profile: ${model.inferenceProfileArn}`
                      : ''
                  }
                >
                  <div className={`rounded-md ${modelColors.icon}`}>
                    {getModelIcon(model.modelId, isInferenceProfile)}
                  </div>
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {model.modelName}
                      {isInferenceProfile && (
                        <span className="ml-2 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                          Profile
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {isInferenceProfile
                        ? model.description || 'Application Inference Profile for cost tracking'
                        : model.toolUse
                          ? 'Supports tool use'
                          : 'Does not support tool use'}
                    </span>
                    {!isInferenceProfile &&
                      (() => {
                        const pricingLabel = getModelPricingLabel(model.modelId)
                        return pricingLabel ? (
                          <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {pricingLabel}
                          </span>
                        ) : null
                      })()}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => (openable ? setIsOpen(!isOpen) : undefined)}
          className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300 rounded-md transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <span className={modelColors.icon}>
              {getModelIcon(selectedModel.modelId, selectedModel.isInferenceProfile)}
            </span>
            <span className="text-left whitespace-nowrap">{selectedModel.modelName}</span>
            <FiChevronDown className="text-gray-400 dark:text-gray-500" size={16} />
          </span>
        </button>
      </div>
    </div>
  )
}
