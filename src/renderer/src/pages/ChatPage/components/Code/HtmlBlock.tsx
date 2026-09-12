import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { VscCode, VscEye } from 'react-icons/vsc'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { tomorrow } from 'react-syntax-highlighter/dist/cjs/styles/prism'
import { ResizableContainer } from './ResizableContainer'

type HtmlBlockProps = {
  code: string
  className?: string
}

export const HtmlBlock: React.FC<HtmlBlockProps> = ({ code, className = '' }) => {
  const { t } = useTranslation()
  const [isPreviewMode, setIsPreviewMode] = useState(true)

  const toggleMode = () => {
    setIsPreviewMode(!isPreviewMode)
  }

  return (
    <div className={`my-4 border border-strong rounded-container overflow-hidden ${className}`}>
      {/* Header with toggle buttons */}
      <div className="flex items-center justify-between bg-raised px-2.5 py-1 border-b border-strong">
        <span className="text-sm font-medium text-ink">HTML</span>
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleMode}
            className={`flex items-center space-x-1 px-3 py-1 rounded-control text-xs font-medium transition-colors ${
              !isPreviewMode ? 'bg-accent text-accent-fg' : 'bg-raised text-ink hover:bg-sunken'
            }`}
          >
            <VscCode size={12} />
            <span>{t('Source')}</span>
          </button>
          <button
            onClick={toggleMode}
            className={`flex items-center space-x-1 px-3 py-1 rounded-control text-xs font-medium transition-colors ${
              isPreviewMode ? 'bg-accent text-accent-fg' : 'bg-raised text-ink hover:bg-sunken'
            }`}
          >
            <VscEye size={12} />
            <span>{t('Preview')}</span>
          </button>
        </div>
      </div>

      {/* Resizable Content area */}
      <ResizableContainer initialHeight={800} minHeight={200} maxHeight={1800}>
        {isPreviewMode ? (
          <div className="h-full bg-surface relative">
            <iframe
              srcDoc={code}
              className="w-full h-full border-0"
              style={{ zIndex: 1 }}
              title="HTML Preview"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        ) : (
          <div className="h-full bg-surface-2 overflow-auto">
            <SyntaxHighlighter
              language="html"
              style={tomorrow}
              showLineNumbers
              wrapLines
              className="!m-0 !bg-transparent h-full"
              customStyle={{
                background: 'transparent',
                padding: '1rem',
                height: '100%'
              }}
            >
              {code}
            </SyntaxHighlighter>
          </div>
        )}
      </ResizableContainer>
    </div>
  )
}

export default HtmlBlock
