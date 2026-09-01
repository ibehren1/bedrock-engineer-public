import React from 'react'
import { useTranslation } from 'react-i18next'
import { FcElectronics } from 'react-icons/fc'
import { IoMdClose } from 'react-icons/io'
import { useSettings } from '@renderer/contexts/SettingsContext'
import { SettingSection } from '../SettingSection'
import { SettingSelect } from '../SettingSelect'
import { bedrockRegions } from '../../utils/regionOptions'

export const BedrockModelsSection: React.FC = () => {
  const { t } = useTranslation()
  const {
    currentLLM,
    updateLLM,
    availableModels,
    awsRegion,
    bedrockSettings,
    updateBedrockSettings
  } = useSettings()

  const modelOptions = availableModels.map((model) => ({
    value: model.modelId,
    label: model.modelName
  }))

  const handleChangeLLM = (modelId: string) => {
    const selectedModel = availableModels.find((model) => model.modelId === modelId)
    if (selectedModel) {
      updateLLM(selectedModel)
    } else {
      console.error(t('Invalid model'))
    }
  }

  const handleVisibleModelSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedModelId = e.target.value
    if (selectedModelId && !bedrockSettings.visibleModelIds.includes(selectedModelId)) {
      updateBedrockSettings({
        visibleModelIds: [...bedrockSettings.visibleModelIds, selectedModelId]
      })
    }
  }

  const handleRemoveVisibleModel = (modelIdToRemove: string) => {
    updateBedrockSettings({
      visibleModelIds: bedrockSettings.visibleModelIds.filter(
        (modelId) => modelId !== modelIdToRemove
      )
    })
  }

  const handleRegionSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedRegion = e.target.value
    if (selectedRegion && !bedrockSettings.availableFailoverRegions.includes(selectedRegion)) {
      updateBedrockSettings({
        availableFailoverRegions: [...bedrockSettings.availableFailoverRegions, selectedRegion]
      })
    }
  }

  const handleRemoveRegion = (regionToRemove: string) => {
    updateBedrockSettings({
      availableFailoverRegions: bedrockSettings.availableFailoverRegions.filter(
        (region) => region !== regionToRemove
      )
    })
  }

  const handleFailoverToggle = (checked: boolean) => {
    if (!checked) {
      // フェイルオーバーを無効にする場合は、選択されているリージョンをクリア
      updateBedrockSettings({
        enableRegionFailover: false,
        availableFailoverRegions: []
      })
    } else {
      updateBedrockSettings({
        enableRegionFailover: true
      })
    }
  }

  return (
    <SettingSection title={t('Amazon Bedrock')} icon={FcElectronics}>
      <div className="space-y-4">
        <SettingSelect
          label={t('LLM (Large Language Model)')}
          value={currentLLM?.modelId}
          options={modelOptions}
          onChange={(e) => handleChangeLLM(e.target.value)}
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('Visible Models')}
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            {t(
              'Select which models appear in the chat model selector. Leave empty to show all models.'
            )}
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            {bedrockSettings.visibleModelIds.map((modelId) => {
              const model = availableModels.find((m) => m.modelId === modelId)
              return (
                <div
                  key={modelId}
                  className="inline-flex items-center px-2.5 py-1.5 rounded-md text-sm
                    bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                >
                  <span>{model ? model.modelName : modelId}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveVisibleModel(modelId)}
                    className="ml-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-800
                      dark:hover:text-blue-200"
                  >
                    <IoMdClose className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
          <select
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600
              focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-600
              sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            value=""
            onChange={handleVisibleModelSelect}
          >
            <option value="">{t('Add a visible model')}</option>
            {availableModels
              .filter((model) => !bedrockSettings.visibleModelIds.includes(model.modelId))
              .map((model) => (
                <option key={model.modelId} value={model.modelId}>
                  {model.modelName}
                </option>
              ))}
          </select>
        </div>

        <div className="space-y-2">
          <div className="space-y-4">
            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300
                  focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800
                  focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                checked={bedrockSettings.enableInferenceProfiles}
                onChange={(e) =>
                  updateBedrockSettings({ enableInferenceProfiles: e.target.checked })
                }
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                {t('Enable Application Inference Profiles')}
              </span>
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 ml-7">
              {t('Use Application Inference Profiles for cost allocation and tracking')}
            </p>

            <label className="inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="form-checkbox h-5 w-5 text-blue-600 rounded border-gray-300
                  focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800
                  focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                checked={bedrockSettings.enableRegionFailover}
                onChange={(e) => handleFailoverToggle(e.target.checked)}
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                {t('Enable Region Failover on ThrottlingException')}
              </span>
            </label>

            {bedrockSettings.enableRegionFailover && (
              <div className="ml-7 space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('Failover Regions')}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {t(
                    'Select regions to be used as failover targets when ThrottlingException occurs'
                  )}
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {bedrockSettings.availableFailoverRegions.map((region) => {
                    const regionInfo = bedrockRegions.find((r) => r.id === region)
                    return (
                      <div
                        key={region}
                        className="inline-flex items-center px-2.5 py-1.5 rounded-md text-sm
                          bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300"
                      >
                        <span>{regionInfo ? `${regionInfo.name} (${region})` : region}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRegion(region)}
                          className="ml-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-800
                            dark:hover:text-blue-200"
                        >
                          <IoMdClose className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
                <select
                  className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 dark:border-gray-600
                    focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:focus:ring-blue-600
                    sm:text-sm rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  value=""
                  onChange={handleRegionSelect}
                >
                  <option value="">{t('Add a failover region')}</option>
                  {bedrockRegions
                    .filter(
                      (region) => !bedrockSettings.availableFailoverRegions.includes(region.id)
                    )
                    .filter((region) => region.id !== awsRegion)
                    .map((region) => (
                      <option key={region.id} value={region.id}>
                        {t(region.name)} ({region.id})
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </SettingSection>
  )
}
