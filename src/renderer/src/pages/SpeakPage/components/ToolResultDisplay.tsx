import React from 'react'
import { Accordion } from 'flowbite-react'
import { FaCheck } from 'react-icons/fa'
import { ToolExecutionState } from '../hooks/useSpeakChat'

interface ToolResultDisplayProps {
  toolExecutionState: ToolExecutionState
}

export const ToolResultDisplay: React.FC<ToolResultDisplayProps> = ({ toolExecutionState }) => {
  if (!toolExecutionState.lastResult) {
    return null
  }

  const { lastResult } = toolExecutionState

  return (
    <div className="mb-4">
      <Accordion className="w-full" collapseAll>
        <Accordion.Panel>
          <Accordion.Title>
            <div className="flex gap-4 items-center">
              <span className="rounded-control">
                <FaCheck className="size-4 text-success" />
              </span>
              <div className="flex gap-2">
                <span>完了:</span>
                <span className="rounded-control px-2 py-1 bg-success-soft text-success text-xs">
                  {lastResult.toolName}
                </span>
              </div>
            </div>
          </Accordion.Title>
          <Accordion.Content className="w-full">
            <div className="text-xs bg-surface p-2 rounded-control border">
              <pre className="whitespace-pre-wrap text-ink">
                {JSON.stringify(lastResult.result, null, 2)}
              </pre>
            </div>
          </Accordion.Content>
        </Accordion.Panel>
      </Accordion>
    </div>
  )
}
