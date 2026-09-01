import React from 'react'
import { ConfigDirSection, ProjectSection } from '../sections'

export const WorkspaceTab: React.FC = () => (
  <div className="flex flex-col gap-8">
    <ProjectSection />
    <ConfigDirSection />
  </div>
)
