import type { ConversationRole } from '@aws-sdk/client-bedrock-runtime'
import React from 'react'
import { LiaUserCircleSolid } from 'react-icons/lia'
import AILogo from '@renderer/assets/images/icons/bedrock-color.png'
import { useSettings } from '@renderer/contexts/SettingsContext'
import { getModelIcon } from '@renderer/components/ModelIcon'
import { allModels } from '@common/models/models'

export const Avatar: React.FC<{ role?: ConversationRole; modelId?: string }> = ({
  role,
  modelId
}) => {
  const { userEmoji, availableModels } = useSettings()

  // モデルIDから表示名（例: "Claude Opus 5"）を解決する。ツールチップに使用。
  // 現在のリージョンで見える一覧を優先し、無ければ全モデルカタログ、最後はID文字列に
  // フォールバックする（過去のセッションで使われた未収載モデルにも対応するため）。
  const model = modelId
    ? availableModels.find((m) => m.modelId === modelId) ??
      allModels.find((m) => m.modelId === modelId)
    : undefined
  const modelName = model?.modelName ?? modelId

  const renderAvatar = (role?: ConversationRole) => {
    if (role === 'assistant') {
      // メッセージを生成したモデルのアイコンを表示する（モデルセレクターの一覧と同じロジック）。
      // モデルIDが不明な場合のみ従来の Bedrock ロゴにフォールバックする。
      //
      // ツールチップはコンテナの title 属性で表示する。内側のアイコンを pointer-events-none に
      // することで、SVG に埋め込まれた独自の <title>（例: "Claude"）ではなく、常にモデル名が
      // 表示されるようにする（全モデルで一貫させるため）。
      return (
        <div
          title={modelName}
          className="h-8 w-8 flex justify-center items-center border border-black dark:border-white rounded-lg"
        >
          <div className="h-5 w-5 flex items-center justify-center text-[20px] pointer-events-none">
            {modelId ? (
              getModelIcon(modelId, model?.isInferenceProfile)
            ) : (
              <img src={AILogo} className="h-full w-full object-contain" alt="assistant" />
            )}
          </div>
        </div>
      )
    } else if (userEmoji) {
      return (
        <div className="flex justify-center items-center">
          <span className="text-2xl leading-none" role="img" aria-label="user">
            {userEmoji}
          </span>
        </div>
      )
    } else {
      return (
        <div className="flex justify-center items-center">
          <LiaUserCircleSolid className="h-6 w-6" />
        </div>
      )
    }
  }

  return (
    <div className="flex items-center justify-center w-10 h-10 dark:text-white">
      {renderAvatar(role)}
    </div>
  )
}
