import type { ConversationRole } from '@aws-sdk/client-bedrock-runtime'
import React from 'react'
import { LiaUserCircleSolid } from 'react-icons/lia'
import AILogo from '@renderer/assets/images/icons/bedrock-color.png'
import { useSettings } from '@renderer/contexts/SettingsContext'

export const Avatar: React.FC<{ role?: ConversationRole }> = ({ role }) => {
  const { userEmoji } = useSettings()

  const renderAvatar = (role?: ConversationRole) => {
    if (role === 'assistant') {
      return (
        <div className="h-8 w-8 flex justify-center items-center bg-icon rounded-lg">
          <div className="h-5 w-5">
            <img src={AILogo} className="h-full w-full object-contain" alt="assistant" />
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
