import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FlowConfig, InputType } from '@/types/agent-chat'
import JSONEditor from '@renderer/components/JSONViewer/JSONEditor'
import JSONViewer from '@renderer/components/JSONViewer'
import { EditIcon, RemoveIcon } from '@renderer/components/icons/ToolIcons'

// オブジェクト型のサンプルスキーマ
const OBJECT_SAMPLES = {
  simple: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'User Name'
      },
      age: {
        type: 'number',
        description: 'Age'
      },
      active: {
        type: 'boolean',
        description: 'State of Active'
      }
    },
    required: ['name']
  },
  nested: {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          contact: {
            type: 'object',
            properties: {
              email: { type: 'string' },
              phone: { type: 'string' }
            }
          }
        }
      },
      settings: {
        type: 'object',
        properties: {
          notifications: { type: 'boolean' },
          theme: { type: 'string' }
        }
      }
    }
  },
  complex: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
        description: 'uuid'
      },
      profile: {
        type: 'object',
        properties: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          birthDate: { type: 'string', format: 'date' },
          address: {
            type: 'object',
            properties: {
              street: { type: 'string' },
              city: { type: 'string' },
              zipCode: { type: 'string' },
              country: { type: 'string' }
            }
          }
        },
        required: ['firstName', 'lastName']
      },
      preferences: {
        type: 'object',
        properties: {
          theme: {
            type: 'string',
            enum: ['light', 'dark', 'system']
          },
          notifications: { type: 'boolean' },
          language: { type: 'string' }
        }
      },
      tags: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['id', 'profile']
  }
}

// 配列型のサンプルスキーマ
const ARRAY_SAMPLES = {
  simple: {
    type: 'array',
    items: {
      type: 'string'
    }
  },
  objects: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        tags: {
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['id', 'name']
    }
  },
  complex: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
        data: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical']
            },
            completed: { type: 'boolean' },
            assignee: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                email: { type: 'string' }
              }
            },
            tags: {
              type: 'array',
              items: { type: 'string' }
            }
          },
          required: ['title', 'priority']
        }
      },
      required: ['id', 'timestamp', 'data']
    }
  }
}

export interface FlowsContentProps {
  flows: FlowConfig[]
  onChange: (flows: FlowConfig[]) => void
}

export const FlowsContent: React.FC<FlowsContentProps> = ({ flows, onChange }) => {
  const { t } = useTranslation()
  const [flowIdentifier, setFlowIdentifier] = useState('')
  const [flowAliasIdentifier, setFlowAliasIdentifier] = useState('')
  const [description, setDescription] = useState('')
  const [inputType, setInputType] = useState<InputType>('string')
  const [schema, setSchema] = useState<object>({})
  const [schemaError, setSchemaError] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  // スキーマが有効なJSONか検証する関数
  const validateSchema = (schema: any): boolean => {
    try {
      // 簡単な検証: JSON Schemaのルール準拠チェック
      if (schema && typeof schema === 'object') {
        return true
      }
      return false
    } catch (e) {
      setSchemaError(e instanceof Error ? e.message : 'Invalid schema')
      return false
    }
  }

  // Flow の編集を開始する関数
  const startEditing = (index: number) => {
    const flow = flows[index]
    setFlowIdentifier(flow.flowIdentifier)
    setFlowAliasIdentifier(flow.flowAliasIdentifier)
    setDescription(flow.description || '')
    setInputType(flow.inputType || 'string')
    setSchema(flow.schema || {})
    setEditingIndex(index)
    // フォームまでスクロール
    document.querySelector('.flex-col.gap-2.p-4.border')?.scrollIntoView({ behavior: 'smooth' })
  }

  // 編集をキャンセルする関数
  const cancelEditing = () => {
    resetForm()
    setEditingIndex(null)
  }

  // Flow を追加または更新する関数
  const saveFlow = () => {
    if (!flowIdentifier || !flowAliasIdentifier) return

    // objectまたはarrayの場合はスキーマのバリデーションを行う
    if ((inputType === 'object' || inputType === 'array') && !validateSchema(schema)) {
      return
    }

    const flowData: FlowConfig = {
      flowIdentifier,
      flowAliasIdentifier,
      description,
      inputType,
      // objectまたはarrayの場合のみschemaを追加
      ...(inputType === 'object' || inputType === 'array' ? { schema } : {})
    }

    if (editingIndex !== null) {
      // 既存の Flow を更新
      const updatedFlows = [...flows]
      updatedFlows[editingIndex] = flowData
      onChange(updatedFlows)
      setEditingIndex(null)
    } else {
      // 新しい Flow を追加
      onChange([...flows, flowData])
    }

    // フォームをリセット
    resetForm()
  }

  // フォームリセット
  const resetForm = () => {
    setFlowIdentifier('')
    setFlowAliasIdentifier('')
    setDescription('')
    setInputType('string')
    setSchema({})
    setSchemaError('')
    setEditingIndex(null)
  }

  // Flow を削除する関数
  const removeFlow = (index: number) => {
    // 編集中の Flow を削除した場合は編集モードを終了
    if (editingIndex === index) {
      resetForm()
    }
    const updatedFlows = [...flows]
    updatedFlows.splice(index, 1)
    onChange(updatedFlows)
  }

  return (
    <div>
      {/* 新しい Flow を登録するフォーム */}
      <div className="flex flex-col gap-2 p-4 border border-gray-200 dark:border-gray-700 rounded-md">
        <h4 className="font-medium text-sm mb-2 dark:text-gray-200">
          {editingIndex !== null ? t('Edit Bedrock Flow') : t('Add New Bedrock Flow')}
        </h4>

        <div className="flex-grow">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            {t('Flow Identifier')}
          </label>
          <input
            type="text"
            value={flowIdentifier}
            onChange={(e) => setFlowIdentifier(e.target.value)}
            placeholder="e.g., FLOW123456"
            className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          />
        </div>

        <div className="flex-grow">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            {t('Flow Alias Identifier')}
          </label>
          <input
            type="text"
            value={flowAliasIdentifier}
            onChange={(e) => setFlowAliasIdentifier(e.target.value)}
            placeholder="e.g., ALIAS123456"
            className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          />
        </div>

        <div className="flex-grow">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            {t('Description')}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Data processing workflow"
            rows={3}
            className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200 resize-vertical"
          />
        </div>

        {/* 新規: 入力型の選択 */}
        <div className="flex-grow">
          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
            {t('Input Type')}
          </label>
          <select
            value={inputType}
            onChange={(e) => setInputType(e.target.value as InputType)}
            className="w-full p-2 text-sm border rounded dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          >
            <option value="string">{t('String')}</option>
            <option value="number">{t('Number')}</option>
            <option value="boolean">{t('Boolean')}</option>
            <option value="object">{t('Object')}</option>
            <option value="array">{t('Array')}</option>
          </select>
        </div>

        {/* 新規: オブジェクトまたは配列の場合はJSONスキーマエディタを表示 */}
        {(inputType === 'object' || inputType === 'array') && (
          <div className="flex-grow">
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
              {t('JSON Schema')}
            </label>

            <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800/50">
              <div className="mb-3">
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                  {inputType === 'object'
                    ? t('Define the structure of the object that will be sent to the Flow.')
                    : t('Define the structure of the array that will be sent to the Flow.')}
                </p>
              </div>

              {/* サンプルリンク部分を改善 */}
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('flow.sample.title', 'サンプルテンプレート')}:
                </p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {inputType === 'object' ? (
                    <>
                      <button
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60"
                        onClick={() => setSchema(OBJECT_SAMPLES.simple)}
                        title={t(
                          'flow.sample.object.simple.tooltip',
                          'シンプルなオブジェクト（名前、年齢、状態）'
                        )}
                      >
                        {t('flow.sample.object.simple', 'シンプル')}
                      </button>
                      <button
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60"
                        onClick={() => setSchema(OBJECT_SAMPLES.nested)}
                        title={t(
                          'flow.sample.object.nested.tooltip',
                          'ネストしたオブジェクト（ユーザー情報と設定）'
                        )}
                      >
                        {t('flow.sample.object.nested', 'ネスト')}
                      </button>
                      <button
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60"
                        onClick={() => setSchema(OBJECT_SAMPLES.complex)}
                        title={t(
                          'flow.sample.object.complex.tooltip',
                          '複雑なオブジェクト（プロフィール、設定、タグなど）'
                        )}
                      >
                        {t('flow.sample.object.complex', '複雑')}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60"
                        onClick={() => setSchema(ARRAY_SAMPLES.simple)}
                        title={t('flow.sample.array.simple.tooltip', '文字列の配列')}
                      >
                        {t('flow.sample.array.simple', 'シンプル')}
                      </button>
                      <button
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60"
                        onClick={() => setSchema(ARRAY_SAMPLES.objects)}
                        title={t(
                          'flow.sample.array.objects.tooltip',
                          'オブジェクトの配列（ID、名前、タグ）'
                        )}
                      >
                        {t('flow.sample.array.objects', 'オブジェクト')}
                      </button>
                      <button
                        className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/60"
                        onClick={() => setSchema(ARRAY_SAMPLES.complex)}
                        title={t(
                          'flow.sample.array.complex.tooltip',
                          '複雑なオブジェクトの配列（タスクデータなど）'
                        )}
                      >
                        {t('flow.sample.array.complex', '複雑')}
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="mb-1">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('flow.editor.title', 'スキーマエディタ')}:
                </p>
              </div>

              <JSONEditor
                value={schema}
                onChange={setSchema}
                height="200px"
                error={schemaError}
                defaultValue={
                  inputType === 'object'
                    ? {
                        type: 'object',
                        properties: {
                          // デフォルトのオブジェクトスキーマ
                        },
                        required: []
                      }
                    : {
                        type: 'array',
                        items: {
                          // デフォルトの配列要素スキーマ
                        }
                      }
                }
              />
              {schemaError && <p className="text-xs text-red-500 mt-1">{schemaError}</p>}

              <div className="mt-3 bg-blue-50 dark:bg-blue-900/20 p-2 rounded text-xs text-gray-600 dark:text-gray-300">
                <p className="font-medium text-blue-700 dark:text-blue-300 mb-1">
                  {t('flow.hint.title', 'ヒント')}:
                </p>
                <p>
                  {t(
                    'flow.hint.description',
                    'JSON Schemaを使用して、Flowに送信するデータの構造を定義します。これにより、AIがFlowに正しい形式のデータを送信できるようになります。'
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={saveFlow}
            disabled={!flowIdentifier || !flowAliasIdentifier}
            className="px-4 py-2 text-sm text-white bg-blue-500 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {editingIndex !== null ? t('Update Flow') : t('Add Flow')}
          </button>
          {editingIndex !== null && (
            <button
              onClick={cancelEditing}
              className="px-4 py-2 text-sm text-gray-700 bg-gray-200 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              {t('Cancel')}
            </button>
          )}
        </div>
      </div>

      {/* 登録済みの Flow 一覧 */}
      <div className="space-y-3 mt-6">
        <h4 className="font-medium text-sm dark:text-gray-200">{t('Registered Bedrock Flows')}</h4>

        {flows.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            {t('No Bedrock Flows registered yet')}
          </p>
        ) : (
          flows.map((flow, index) => (
            <div
              key={index}
              className="flex flex-col p-3 text-sm bg-gray-100 dark:bg-gray-900 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono">
                  {t('Flow Identifier')}: {flow.flowIdentifier}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => startEditing(index)}
                    className="text-blue-500 hover:text-blue-600 p-1"
                    title="Edit"
                    aria-label="Edit flow"
                  >
                    <EditIcon />
                  </button>
                  <button
                    onClick={() => removeFlow(index)}
                    className="text-red-500 hover:text-red-600 p-1"
                    title="Remove"
                    aria-label="Remove flow"
                  >
                    <RemoveIcon />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-line">
                {flow.description}
              </p>
              {/* 情報を横並びにする新しいレイアウト */}
              <div className="flex gap-4 mt-1">
                <div className="w-[15rem]">
                  <div>
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {t('Flow Alias Identifier')}:{' '}
                      <span className="font-mono">{flow.flowAliasIdentifier}</span>
                    </span>
                  </div>

                  {flow.inputType && (
                    <div>
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {t('Input Type')}: <span className="font-mono">{flow.inputType}</span>
                      </span>
                    </div>
                  )}
                </div>

                {flow.schema && (
                  <div className="flex flex-col w-full">
                    <JSONViewer
                      data={flow.schema}
                      title={t('Schema')}
                      maxHeight="400px"
                      showCopyButton={true}
                    />
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
