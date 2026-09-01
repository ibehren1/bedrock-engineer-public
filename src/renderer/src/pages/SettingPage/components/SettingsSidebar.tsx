import React from 'react'
import { useTranslation } from 'react-i18next'
import { SETTING_TABS, SettingTabId } from '../settingTabs'

interface SettingsSidebarProps {
  activeTab: SettingTabId
  onTabChange: (tab: SettingTabId) => void
}

/**
 * Left rail for the settings tabs. Mirrors the agent editor's sidebar
 * (AgentFormSidebar) so the two in-page rails look and behave the same.
 */
export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation()

  return (
    <nav aria-label={t('Settings')} className="py-2">
      <ul className="space-y-1 px-2">
        {SETTING_TABS.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <li key={tab.id}>
              <button
                type="button"
                onClick={() => onTabChange(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                title={t(tab.labelKey)}
                className={`relative flex items-center w-full px-3 py-2.5 rounded-lg text-left transition-all duration-200 ease-in-out ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 dark:bg-gray-700/50 dark:text-gray-100'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                <span className="flex items-center justify-center w-6">
                  <tab.icon className={tab.iconClassName ?? 'w-5 h-5'} />
                </span>
                <span className="text-sm font-medium ml-3 lg:block hidden">{t(tab.labelKey)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
