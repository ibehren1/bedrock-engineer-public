import React from 'react'
import { isPlanModeCompatible } from '@/types/plan-mode-tools'

interface PlanModeCompatibilityBadgeProps {
  toolName: string
}

export const PlanModeCompatibilityBadge: React.FC<PlanModeCompatibilityBadgeProps> = ({
  toolName
}) => {
  const isPlanCompatible = isPlanModeCompatible(toolName)

  // Planモード非対応のツールの場合のみバッジを表示
  if (!isPlanCompatible) {
    return (
      <span className="bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded dark:bg-blue-900/50 dark:text-blue-200">
        Act only
      </span>
    )
  }

  // Planモード対応のツールの場合は何も表示しない
  return null
}
