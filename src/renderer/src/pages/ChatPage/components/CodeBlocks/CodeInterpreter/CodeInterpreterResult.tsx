import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExecutedCodeBlock } from './ExecutedCodeBlock'
import { OutputDisplay } from './OutputDisplay'
import { FileDisplay } from './FileDisplay'
import { ErrorDisplay } from './ErrorDisplay'
import { ExecutionMetadata } from './ExecutionMetadata'
import { FaCode, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa'

interface CodeInterpreterResult {
  success: boolean
  name: string
  code: string // The executed code
  message: string
  output: string
  error?: string
  executionTime: number
  result: {
    code: string // The executed code (also in result for backward compatibility)
    stdout: string
    stderr: string
    exitCode: number
    files: string[]
  }
}

interface CodeInterpreterResultProps {
  response: CodeInterpreterResult
}

export const CodeInterpreterResult: React.FC<CodeInterpreterResultProps> = ({ response }) => {
  const { t } = useTranslation('tools')
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    code: false,
    output: true, // Default to expanded
    files: true, // Always expanded
    errors: false
  })

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const hasFiles = response.result.files && response.result.files.length > 0
  const hasError = !response.success || response.result.stderr
  const hasOutput = response.result.stdout || response.output

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 dark:bg-gray-900 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FaCode className="text-green-600 size-5" />
            <span className="font-semibold text-gray-900 dark:text-white">
              {t('code interpreter display.Code Interpreter', 'Code Interpreter')}
            </span>
            <div className="flex items-center gap-2">
              {response.success ? (
                <FaCheckCircle className="text-green-500 size-4" />
              ) : (
                <FaExclamationCircle className="text-red-500 size-4" />
              )}
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${
                  response.success
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300'
                }`}
              >
                {response.success
                  ? t('code interpreter display.Success', 'Success')
                  : t('code interpreter display.Failed', 'Failed')}
              </span>
            </div>
          </div>
          <ExecutionMetadata
            executionTime={response.executionTime}
            exitCode={response.result.exitCode}
            fileCount={response.result.files?.length || 0}
          />
        </div>
      </div>

      {/* Content */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {/* Executed Code */}
        {response.code && (
          <div className="p-4">
            <button
              onClick={() => toggleSection('code')}
              className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mb-3"
            >
              <span className="text-xs">📝</span>
              <span>{t('code interpreter display.Executed Code', 'Executed Code')}</span>
              <span className="ml-auto text-xs text-gray-500">
                {expandedSections.code ? '▼' : '▶'}
              </span>
            </button>
            {expandedSections.code && <ExecutedCodeBlock code={response.code} />}
          </div>
        )}

        {/* Output */}
        {hasOutput && (
          <div className="p-4">
            <button
              onClick={() => toggleSection('output')}
              className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mb-3"
            >
              <span className="text-xs">📊</span>
              <span>{t('code interpreter display.Output', 'Output')}</span>
              <span className="ml-auto text-xs text-gray-500">
                {expandedSections.output ? '▼' : '▶'}
              </span>
            </button>
            {expandedSections.output && (
              <OutputDisplay stdout={response.result.stdout} output={response.output} />
            )}
          </div>
        )}

        {/* Generated Files */}
        {hasFiles && (
          <div className="p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              <span className="text-xs">📁</span>
              <span>
                {t('code interpreter display.Generated Files', 'Generated Files')} (
                {response.result.files.length})
              </span>
            </div>
            <FileDisplay files={response.result.files} />
          </div>
        )}

        {/* Errors */}
        {hasError && (
          <div className="p-4">
            <button
              onClick={() => toggleSection('errors')}
              className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white mb-3"
            >
              <span className="text-xs">⚠️</span>
              <span>{t('code interpreter display.Errors', 'Errors')}</span>
              <span className="ml-auto text-xs text-gray-500">
                {expandedSections.errors ? '▼' : '▶'}
              </span>
            </button>
            {expandedSections.errors && (
              <ErrorDisplay
                error={response.error}
                stderr={response.result.stderr}
                exitCode={response.result.exitCode}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
