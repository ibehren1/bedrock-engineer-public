import React, { useState } from 'react'
import { FaClock, FaCheck, FaTimes, FaDocker } from 'react-icons/fa'
import { MdCancel } from 'react-icons/md'

import { CodeInterpreterResult } from '../CodeBlocks/CodeInterpreter/CodeInterpreterResult'

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface AsyncTaskInfo {
  taskId: string
  status: TaskStatus
  message: string
  progress?: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  executionResult?: any
}

interface AsyncTaskCardProps {
  taskInfo: AsyncTaskInfo
}

const statusConfig = {
  pending: {
    icon: FaClock,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-200 dark:border-yellow-800',
    label: 'Pending'
  },
  running: {
    icon: FaDocker,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    label: 'Running'
  },
  completed: {
    icon: FaCheck,
    color: 'text-green-500',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-200 dark:border-green-800',
    label: 'Completed'
  },
  failed: {
    icon: FaTimes,
    color: 'text-red-500',
    bgColor: 'bg-red-50 dark:bg-red-900/20',
    borderColor: 'border-red-200 dark:border-red-800',
    label: 'Failed'
  },
  cancelled: {
    icon: MdCancel,
    color: 'text-gray-500',
    bgColor: 'bg-gray-50 dark:bg-gray-900/20',
    borderColor: 'border-gray-200 dark:border-gray-800',
    label: 'Cancelled'
  }
}

// Convert executionResult to CodeInterpreterResult format
const convertToCodeInterpreterResult = (executionResult: any) => {
  if (!executionResult) return null

  return {
    success: executionResult.success !== false,
    name: 'codeInterpreter',
    code: executionResult.code || '',
    message: executionResult.message || '',
    output: executionResult.output || '',
    error: executionResult.error,
    executionTime: executionResult.executionTime || 0,
    result: {
      code: executionResult.code || '',
      stdout: executionResult.stdout || executionResult.output || '',
      stderr: executionResult.stderr || executionResult.error || '',
      exitCode: executionResult.exitCode || (executionResult.success !== false ? 0 : 1),
      files: executionResult.files || []
    }
  }
}

export const AsyncTaskCard: React.FC<AsyncTaskCardProps> = ({ taskInfo }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  const config = statusConfig[taskInfo.status]
  const displayConfig = statusConfig[taskInfo.status] || config
  const StatusIcon = displayConfig.icon

  const formatDuration = (start?: string, end?: string) => {
    if (!start) return null
    const startTime = new Date(start)
    const endTime = end ? new Date(end) : new Date()
    const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)

    if (duration < 60) return `${duration}s`
    if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`
    return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`
  }

  const codeInterpreterResult = convertToCodeInterpreterResult(taskInfo.executionResult)

  // If completed and has execution result, show detailed result
  if (taskInfo.status === 'completed' && codeInterpreterResult) {
    return <CodeInterpreterResult response={codeInterpreterResult} />
  }

  return (
    <div
      className={`rounded-lg border ${displayConfig.borderColor} ${displayConfig.bgColor} p-4 mb-2`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <StatusIcon className={`w-5 h-5 ${displayConfig.color}`} />
          <div>
            <span className="font-medium text-sm dark:text-gray-200">
              Code Interpreter Execution
            </span>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {displayConfig.label} • {taskInfo.taskId.substring(0, 12)}...
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Progress bar for running tasks */}
          {taskInfo.status === 'running' && taskInfo.progress !== undefined && (
            <div className="w-20 bg-gray-200 rounded-full h-2 dark:bg-gray-700">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${taskInfo.progress}%` }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Status message */}
      <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">{taskInfo.message}</div>

      {/* Timing information */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>Created: {new Date(taskInfo.createdAt).toLocaleTimeString()}</span>
        {taskInfo.startedAt && (
          <span>Started: {new Date(taskInfo.startedAt).toLocaleTimeString()}</span>
        )}
        {taskInfo.completedAt && (
          <span>Completed: {new Date(taskInfo.completedAt).toLocaleTimeString()}</span>
        )}
        {taskInfo.startedAt && (
          <span>Duration: {formatDuration(taskInfo.startedAt, taskInfo.completedAt)}</span>
        )}
      </div>

      {/* Expandable details for non-completed tasks */}
      {!codeInterpreterResult && (taskInfo.executionResult || isExpanded) && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 mb-2"
          >
            {isExpanded ? '▼' : '▶'} Details
          </button>

          {isExpanded && (
            <div className="text-xs">
              <div className="bg-gray-100 dark:bg-gray-800 rounded p-2 font-mono">
                Task ID: {taskInfo.taskId}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
