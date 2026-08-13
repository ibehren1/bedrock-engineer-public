import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BsGithub } from 'react-icons/bs'
import { RiCloseLine } from 'react-icons/ri'
import { FiExternalLink } from 'react-icons/fi'

export const useContributorModal = () => {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useTranslation()

  const openModal = () => setIsOpen(true)
  const closeModal = () => setIsOpen(false)

  /**
   * Generates a GitHub issue URL with pre-filled information for contributing an agent
   */
  const getGitHubIssueUrl = () => {
    const issueTitle = encodeURIComponent('Add Custom Agent: [Your Agent Name]')
    const issueLabels = encodeURIComponent('enhancement,agent-directory')

    const bodyTemplate = `
## Agent Information

**Agent Name**: [Your Agent Name]

**Description**: [Brief description of what your agent does]

**Author**: [Your GitHub Username]

**Tags**: [Comma-separated list of relevant tags]

## YAML Content

\`\`\`yaml
# Please paste your exported YAML content here
name: "Your Agent Name"
description: "Brief description of what your agent does"
author: "your-github-username"
# Rest of your exported YAML...
\`\`\`

## Additional Notes

[Any additional information or context about your agent]
    `.trim()

    const issueBody = encodeURIComponent(bodyTemplate)

    return `https://github.com/aws-samples/bedrock-engineer/issues/new?title=${issueTitle}&labels=${issueLabels}&body=${issueBody}`
  }

  const ContributorModal = () => {
    // Handle ESC key press to close the modal
    const handleKeyDown = (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal()
      }
    }

    return isOpen ? (
      <div className="fixed inset-0 z-50 overflow-y-auto" onKeyDown={handleKeyDown}>
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={closeModal}></div>

        {/* Modal */}
        <div className="flex items-center justify-center min-h-screen p-4">
          <div
            className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              onClick={closeModal}
              aria-label={t('close')}
            >
              <RiCloseLine size={24} />
            </button>

            {/* Header */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold dark:text-white">{t('contributor.title')}</h2>
              <p className="mt-1 text-gray-600 dark:text-gray-400">{t('contributor.subtitle')}</p>
            </div>

            {/* Content */}
            <div className="mb-6">
              <h3 className="text-lg font-medium mb-2 dark:text-white">{t('contributor.steps')}</h3>
              <ol className="list-decimal pl-5 space-y-3 dark:text-gray-300">
                <li>
                  {t('contributor.step1')}
                  <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-sm">
                    <code>{'[Your Agent Name] > ⋮ > Export > As Shared File'}</code>
                  </div>
                </li>
                <li>
                  {t('contributor.step2')}
                  <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-sm">
                    <code
                      onClick={() => {
                        open(
                          'https://github.com/aws-samples/bedrock-engineer/tree/main/src/renderer/src/assets/directory-agents'
                        )
                      }}
                      className="hover:text-blue-600 cursor-pointer"
                    >
                      src/renderer/src/assets/directory-agents/
                    </code>
                  </div>
                </li>
                <li>
                  {t('contributor.step3')}
                  <div className="mt-1 p-3 bg-gray-50 dark:bg-gray-700 rounded-md text-sm">
                    <code className="whitespace-pre-wrap">{'author: "your-github-username"'}</code>
                  </div>
                </li>
                <li>{t('contributor.step4')}</li>
              </ol>
            </div>

            {/* Submit Options */}
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-medium mb-3 dark:text-white">
                {t('contributor.submitOptions')}
              </h3>

              <div className="flex flex-col md:flex-row gap-4">
                {/* GitHub Pull Request Option */}
                <div className="flex-1 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                  <h4 className="font-medium mb-2 dark:text-white">{t('contributor.prOption')}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {t('contributor.prDescription')}
                  </p>
                  <a
                    href="https://github.com/aws-samples/bedrock-engineer"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    <BsGithub className="w-4 h-4 mr-1" />
                    <span>{t('contributor.viewRepo')}</span>
                    <FiExternalLink className="ml-1 w-3 h-3" />
                  </a>
                </div>

                {/* GitHub Issue Option */}
                <div className="flex-1 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900/50">
                  <h4 className="font-medium mb-2 dark:text-white">
                    {t('contributor.issueOption')}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {t('contributor.issueDescription')}
                  </p>
                  <a
                    href={getGitHubIssueUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm font-medium px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                  >
                    <BsGithub className="w-4 h-4 mr-1" />
                    <span>{t('contributor.createIssue')}</span>
                    <FiExternalLink className="ml-1 w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end mt-6">
              <button
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-600 dark:hover:bg-blue-700"
                onClick={closeModal}
              >
                {t('close')}
              </button>
            </div>
          </div>
        </div>
      </div>
    ) : null
  }

  return {
    ContributorModal,
    openModal,
    closeModal,
    isOpen
  }
}
