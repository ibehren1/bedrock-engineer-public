import React from 'react'
import {
  AppearanceSection,
  LanguageSection,
  NotificationSection,
  SidebarSection,
  UserAvatarSection
} from '../sections'

export const GeneralTab: React.FC = () => (
  <div className="flex flex-col gap-8">
    <LanguageSection />
    <AppearanceSection />
    <UserAvatarSection />
    <SidebarSection />
    <NotificationSection />
  </div>
)
