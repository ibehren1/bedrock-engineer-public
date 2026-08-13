import React, { useCallback, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { FaClock, FaCheckCircle, FaTimesCircle, FaSpinner, FaTimes, FaSync } from 'react-icons/fa'
import { FaListCheck } from 'react-icons/fa6'

// Import shared types from common location
import type { TodoList, TodoItemStatus } from '../../../../../types/tools'

// Signal emitted when the TODO list changes, used to flash the header icon
export interface TodoFlash {
  status: TodoItemStatus
  nonce: number
}

interface TodoModalProps {
  isOpen: boolean
  onClose: () => void
  todoList?: TodoList | null
  onRefresh?: () => void
  loading?: boolean
}

// Get status icon
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'pending':
      return <FaClock className="text-yellow-500 dark:text-yellow-400" />
    case 'in_progress':
      return <FaSpinner className="text-blue-500 dark:text-blue-400 animate-spin" />
    case 'completed':
      return <FaCheckCircle className="text-green-500 dark:text-green-400" />
    case 'cancelled':
      return <FaTimesCircle className="text-red-500 dark:text-red-400" />
    default:
      return <FaClock className="text-gray-500 dark:text-gray-400" />
  }
}

// Todo Floating Window Component
export const TodoModal: React.FC<TodoModalProps> = ({
  isOpen,
  onClose,
  todoList,
  onRefresh,
  loading
}) => {
  const { t } = useTranslation()

  if (!isOpen) return null

  return (
    <div className="fixed top-4 right-4 z-50 w-80 max-h-196 overflow-hidden transform transition-all duration-200 ease-in-out opacity-100">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-600">
          <div className="flex items-center gap-3">
            <FaListCheck className="text-blue-600 dark:text-blue-400" size={16} />
            <span className="font-semibold text-gray-900 dark:text-white">{t('TODO List')}</span>
          </div>
          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                title={t('common.refresh')}
              >
                <FaSync
                  className={`text-gray-500 dark:text-gray-400 ${loading ? 'animate-spin' : ''}`}
                  size={12}
                />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <FaTimes className="text-gray-500 dark:text-gray-400" size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 max-h-120 overflow-y-auto">
          {!todoList || !todoList.items.length ? (
            // Empty state
            <div className="flex flex-col items-center justify-center py-8 text-center text-gray-500 dark:text-gray-400">
              <FaListCheck className="text-3xl mb-2 text-gray-300 dark:text-gray-600" />
              <h3 className="font-medium mb-1">{t('No TODO List Available')}</h3>
              <p className="text-xs">
                {t('Create a TODO list using the todoInit tool to see tasks here.')}
              </p>
            </div>
          ) : (
            // Simple task list
            <div className="space-y-2">
              {todoList.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                >
                  <div className="flex-shrink-0">{getStatusIcon(item.status)}</div>
                  <span className="flex-grow text-sm text-gray-900 dark:text-white">
                    {item.description}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Build a comparable signature of the list's item statuses
const buildStatusSignature = (list: TodoList | null): string =>
  list ? list.items.map((item) => `${item.id}:${item.status}`).join('|') : ''

// Pick the status to flash from the changed items (prefer the most advanced state)
const STATUS_PRIORITY: TodoItemStatus[] = ['completed', 'in_progress', 'cancelled', 'pending']
const pickFlashStatus = (prev: TodoList | null, next: TodoList | null): TodoItemStatus | null => {
  if (!next) return null
  const prevById = new Map((prev?.items ?? []).map((item) => [item.id, item.status]))
  const changed = next.items
    .filter((item) => prevById.get(item.id) !== item.status)
    .map((item) => item.status)
  if (changed.length === 0) return null
  return STATUS_PRIORITY.find((status) => changed.includes(status)) ?? changed[0]
}

// Custom hook for todo modal with real-time updates
export const useTodoModal = (messages?: any[], currentSessionId?: string) => {
  const [show, setShow] = useState(false)
  const [todoList, setTodoList] = useState<TodoList | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<TodoFlash | null>(null)

  // Track the last-seen list/signature/session to detect real changes.
  // Kept in refs so fetchTodoList stays stable and doesn't cause a poll loop.
  const prevListRef = useRef<TodoList | null>(null)
  const lastSignatureRef = useRef<string>('')
  const lastSessionRef = useRef<string | undefined>(undefined)
  const flashNonceRef = useRef(0)

  const fetchTodoList = useCallback(
    async (options?: { silent?: boolean }) => {
      try {
        if (!options?.silent) setLoading(true)
        setError(null)

        // Only fetch if session ID exists (no fallback behavior)
        if (!currentSessionId) {
          setTodoList(null)
          return
        }

        const data = await window.api.todo.getTodoList({ sessionId: currentSessionId })

        // Detect status changes and flash the header icon accordingly.
        // Suppress flashing on the first load of a session so switching
        // sessions doesn't trigger a spurious flash.
        const signature = buildStatusSignature(data)
        const isNewSession = lastSessionRef.current !== currentSessionId
        if (!isNewSession && signature !== lastSignatureRef.current) {
          const status = pickFlashStatus(prevListRef.current, data)
          if (status) {
            flashNonceRef.current += 1
            setFlash({ status, nonce: flashNonceRef.current })
          }
        }
        prevListRef.current = data
        lastSignatureRef.current = signature
        lastSessionRef.current = currentSessionId

        setTodoList(data)
      } catch (err) {
        console.error('Failed to fetch TODO list:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch TODO list')
        setTodoList(null)
      } finally {
        setLoading(false)
      }
    },
    [currentSessionId]
  )

  // Poll for TODO list changes whenever there are messages, regardless of
  // whether the modal is open. `todoUpdate` tool calls happen mid-stream
  // inside an existing assistant message, so messages.length is not a
  // reliable signal — a short interval reliably catches status changes so
  // the header icon can flash. Poll faster while streaming.
  const hasMessages = !!messages && messages.length > 0
  useEffect(() => {
    if (!hasMessages) return undefined

    // Fetch immediately, then on a short interval (silent: no spinner flicker)
    fetchTodoList({ silent: true })
    const interval = setInterval(() => {
      fetchTodoList({ silent: true })
    }, 2000) // Refresh every 2 seconds

    return () => clearInterval(interval)
  }, [hasMessages, currentSessionId, fetchTodoList])

  const handleOpen = useCallback(
    async (list?: TodoList | null) => {
      // Don't open if there are no messages
      if (!messages || messages.length === 0) {
        return
      }

      if (list) {
        setTodoList(list)
      } else {
        // Fetch from API if no data provided
        await fetchTodoList()
      }
      setShow(true)
    },
    [fetchTodoList, messages]
  )

  const handleClose = useCallback(() => {
    setShow(false)
    setError(null)
  }, [])

  const handleRefresh = useCallback(() => {
    fetchTodoList()
  }, [fetchTodoList])

  return {
    show,
    todoList,
    loading,
    error,
    flash,
    handleOpen,
    handleClose,
    fetchTodoList,
    handleRefresh,
    TodoModal: (props: Omit<TodoModalProps, 'todoList' | 'onRefresh' | 'loading'>) => (
      <TodoModal {...props} todoList={todoList} onRefresh={handleRefresh} loading={loading} />
    )
  }
}
