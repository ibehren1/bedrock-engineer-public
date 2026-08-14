import { LuBrainCircuit } from 'react-icons/lu'
import NovaLogo from './nova-color.svg'
import ClaudeLogo from './claude-color.svg'
import DeepSeekLogo from './deepseek-color.svg'
import MetaLogo from './meta-color.svg'
import OpenAILogo from './openai-color.svg'

/**
 * モデルIDからアイコンを返す。モデルセレクターの一覧とチャットのアバターで共有し、
 * 両者のアイコンが常に一致するようにする。
 * 専用アイコンが無いモデルは汎用アイコン（LuBrainCircuit）にフォールバックする。
 */
export const getModelIcon = (modelId: string, isInferenceProfile?: boolean) => {
  // Show group icon for inference profiles
  if (isInferenceProfile) return <LuBrainCircuit className="size-4 text-blue-600" />

  if (modelId.includes('claude')) return <ClaudeLogo />
  if (modelId.includes('nova')) return <NovaLogo />
  if (modelId.includes('deepseek')) return <DeepSeekLogo />
  if (modelId.includes('meta')) return <MetaLogo />
  if (modelId.includes('gpt-oss') || modelId.includes('openai')) return <OpenAILogo />
  if (modelId.includes('llama')) return <LuBrainCircuit className="size-4" />
  return <LuBrainCircuit />
}
