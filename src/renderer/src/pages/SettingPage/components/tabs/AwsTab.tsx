import React from 'react'
import { AwsCredentialsSection, ProxySection, VoiceChatRegionSection } from '../sections'

export const AwsTab: React.FC = () => (
  <div className="flex flex-col gap-4">
    <AwsCredentialsSection />
    <ProxySection />
    <VoiceChatRegionSection />
  </div>
)
