import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CommandConfig } from '@/types/agent-chat'
import { EditIcon, RemoveIcon } from '@renderer/components/icons/ToolIcons'

interface CommandsSectionProps {
  commands: CommandConfig[]
  onChange: (commands: CommandConfig[]) => void
}

export const CommandsSection: React.FC<CommandsSectionProps> = ({ commands = [], onChange }) => {
  const { t } = useTranslation()
  const [newCommand, setNewCommand] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [editMode, setEditMode] = useState<string | null>(null)
  const [editData, setEditData] = useState<CommandConfig>({ pattern: '', description: '' })

  const handleAddCommand = () => {
    if (newCommand.trim() && newDescription.trim()) {
      onChange([
        ...commands,
        {
          pattern: newCommand.trim(),
          description: newDescription.trim()
        }
      ])
      setNewCommand('')
      setNewDescription('')
    }
  }

  const handleRemoveCommand = (pattern: string) => {
    onChange(commands.filter((cmd) => cmd.pattern !== pattern))
  }

  const handleEditCommand = (command: CommandConfig) => {
    setEditMode(command.pattern)
    setEditData({ ...command })
  }

  const handleSaveEdit = () => {
    if (editData.pattern.trim() && editData.description.trim()) {
      onChange(commands.map((cmd) => (cmd.pattern === editMode ? { ...editData } : cmd)))
      setEditMode(null)
      setEditData({ pattern: '', description: '' })
    }
  }

  const handleCancelEdit = () => {
    setEditMode(null)
    setEditData({ pattern: '', description: '' })
  }

  return (
    <div className="space-y-4 border border-gray-200 dark:border-gray-700 rounded-md p-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-700 dark:text-white">
          {t('Allowed Commands')}
        </h3>
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t('Configure which system commands the agent is allowed to execute.')}
      </p>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-md">
        <h5 className="font-medium mb-1 text-yellow-800 dark:text-yellow-300 text-sm">
          {t('Security Warning')}
        </h5>
        <p className="text-xs text-gray-700 dark:text-gray-300">
          {t(
            'Only allow commands that you trust this agent to execute. Use wildcards (*) to define patterns.'
          )}
        </p>
      </div>

      {/* コマンド追加フォーム */}
      <div className="flex flex-col gap-2 mt-4">
        <h4 className="font-medium text-sm mb-2">{t('Add New Command Pattern')}</h4>
        <div>
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            {t('Command Pattern')}
          </label>
          <input
            type="text"
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            placeholder="e.g., ls *"
            className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('Use * as a wildcard (e.g., "npm *" allows all npm commands)')}
          </p>
        </div>
        <div className="mt-2">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            {t('Description')}
          </label>
          <textarea
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="e.g., List directory contents"
            rows={2}
            className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 resize-vertical"
          />
        </div>
        <button
          onClick={handleAddCommand}
          disabled={!newCommand.trim() || !newDescription.trim()}
          className="px-4 py-1.5 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed mt-2 w-fit"
        >
          {t('Add Command')}
        </button>
      </div>

      {/* 登録済みコマンドリスト */}
      <div className="space-y-3 mt-6">
        <h4 className="font-medium text-sm">{t('Current Command Patterns')}</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {commands.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic">
              {t('No command patterns registered yet')}
            </p>
          ) : (
            commands.map((command) => (
              <div
                key={command.pattern}
                className="flex flex-col p-3 text-sm bg-gray-100 dark:bg-gray-900 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-700"
              >
                {editMode === command.pattern ? (
                  // 編集モード
                  <div className="flex flex-col gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        {t('Command Pattern')}
                      </label>
                      <input
                        type="text"
                        value={editData.pattern}
                        onChange={(e) => setEditData({ ...editData, pattern: e.target.value })}
                        className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
                      />
                    </div>
                    <div className="mt-2">
                      <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                        {t('Description')}
                      </label>
                      <textarea
                        value={editData.description}
                        onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                        rows={2}
                        className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 resize-vertical"
                      />
                    </div>
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1 text-sm text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
                      >
                        {t('Cancel')}
                      </button>
                      <button
                        onClick={handleSaveEdit}
                        disabled={!editData.pattern.trim() || !editData.description.trim()}
                        className="px-3 py-1 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        {t('Save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  // 表示モード
                  <>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-medium">{command.pattern}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditCommand(command)}
                          className="text-blue-500 hover:text-blue-600 p-1"
                          title="Edit"
                          aria-label="Edit command"
                        >
                          <EditIcon />
                        </button>
                        <button
                          onClick={() => handleRemoveCommand(command.pattern)}
                          className="text-red-500 hover:text-red-600 p-1"
                          title="Remove"
                          aria-label="Remove command"
                        >
                          <RemoveIcon />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-line">
                      {command.description}
                    </p>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default CommandsSection
