import React from 'react'
import { AdvancedSection, AgentChatSection } from '../sections'

export const ChatTab: React.FC = () => (
  <div className="flex flex-col gap-8">
    <AgentChatSection />
    <AdvancedSection />
  </div>
)
