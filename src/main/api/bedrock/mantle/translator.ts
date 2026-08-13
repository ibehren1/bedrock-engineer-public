/**
 * Translation between the app-wide Bedrock Converse shapes and the OpenAI
 * Responses API used by GPT models on the bedrock-mantle endpoint.
 *
 * The entire renderer + tool system speaks Bedrock Converse
 * (Message / ContentBlock / ConverseStreamOutput). GPT-5.5 only speaks the
 * Responses API. Rather than teach the renderer a second dialect, we keep
 * Converse as the internal lingua franca and translate at this boundary:
 *
 *   request:  CallConverseAPIProps (Converse)  ->  Responses request
 *   response: Responses stream events          ->  ConverseStreamOutput events
 *
 * These functions are pure so they can be unit-tested without network access.
 */
import type {
  ContentBlock,
  ConverseStreamOutput,
  Message,
  StopReason,
  SystemContentBlock,
  ToolConfiguration
} from '@aws-sdk/client-bedrock-runtime'
import type { ThinkingMode } from '../../../../types/llm'

// ---------------------------------------------------------------------------
// Request translation (Converse -> Responses)
// ---------------------------------------------------------------------------

/** Minimal shape of the Responses "function" tool definition. */
export interface ResponsesFunctionTool {
  type: 'function'
  name: string
  description?: string
  parameters: Record<string, unknown> | null
  strict: boolean | null
}

/** A single item in the Responses `input` array (subset we produce). */
export type ResponsesInputItem =
  | {
      type: 'message'
      role: 'user' | 'assistant' | 'system' | 'developer'
      content: ResponsesContentPart[]
    }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string }

export type ResponsesContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' }
  | { type: 'output_text'; text: string }

export interface ResponsesRequest {
  model: string
  input: ResponsesInputItem[]
  instructions?: string
  tools?: ResponsesFunctionTool[]
  max_output_tokens?: number
  temperature?: number
  top_p?: number
  reasoning?: { effort: 'low' | 'medium' | 'high' }
  /** GPT on Bedrock is used statelessly; the app resends full history. */
  store: false
}

export interface BuildRequestOptions {
  modelId: string
  messages: Message[]
  system?: SystemContentBlock[]
  toolConfig?: ToolConfiguration
  inferenceConfig?: { maxTokens?: number; temperature?: number; topP?: number }
  thinkingMode?: ThinkingMode
  disableThinking?: boolean
}

/**
 * Map the app's thinking-mode budget onto the Responses `reasoning.effort`
 * levels supported by the SDK ('low' | 'medium' | 'high').
 */
export function mapThinkingToEffort(
  thinkingMode?: ThinkingMode
): 'low' | 'medium' | 'high' | undefined {
  if (!thinkingMode || thinkingMode.type === 'disabled') {
    return undefined
  }
  const budget = thinkingMode.budget_tokens ?? 0
  if (budget >= 16384) return 'high'
  if (budget >= 4096) return 'medium'
  return 'low'
}

/** Concatenate Bedrock system content blocks into a single instructions string. */
export function systemToInstructions(system?: SystemContentBlock[]): string | undefined {
  if (!system || system.length === 0) return undefined
  const text = system
    .map((block) => ('text' in block ? block.text : undefined))
    .filter((t): t is string => typeof t === 'string' && t.length > 0)
    .join('\n\n')
  return text.length > 0 ? text : undefined
}

/** Convert a Bedrock toolResult content array into a plain string output. */
function toolResultToString(
  content: NonNullable<ContentBlock.ToolResultMember['toolResult']>['content']
): string {
  if (!content) return ''
  const parts = content.map((c) => {
    if ('json' in c && c.json !== undefined) return JSON.stringify(c.json)
    if ('text' in c && typeof c.text === 'string') return c.text
    return ''
  })
  return parts.filter((p) => p.length > 0).join('\n')
}

/** Build a data URL from a Bedrock image content block. */
function imageBlockToDataUrl(
  image: NonNullable<ContentBlock.ImageMember['image']>
): string | undefined {
  const format = image.format ?? 'png'
  const bytes = image.source && 'bytes' in image.source ? image.source.bytes : undefined
  if (!bytes) return undefined
  const base64 = Buffer.from(bytes).toString('base64')
  return `data:image/${format};base64,${base64}`
}

/**
 * Translate Bedrock messages into a flat Responses `input` item list.
 *
 * - user text/image blocks   -> a `message` item with input_text / input_image parts
 * - assistant text blocks     -> a `message` item with output_text parts
 * - assistant toolUse blocks  -> separate `function_call` items (call_id = toolUseId)
 * - user toolResult blocks    -> separate `function_call_output` items
 * - reasoningContent blocks   -> dropped (encrypted reasoning is not round-trippable;
 *                                see the reasoning note in responsesService)
 */
export function messagesToResponsesInput(messages: Message[]): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = []

  for (const message of messages) {
    const role = message.role === 'assistant' ? 'assistant' : 'user'
    const content = Array.isArray(message.content) ? message.content : []
    const messageParts: ResponsesContentPart[] = []

    for (const block of content) {
      if ('text' in block && typeof block.text === 'string') {
        if (block.text.length === 0) continue
        messageParts.push(
          role === 'assistant'
            ? { type: 'output_text', text: block.text }
            : { type: 'input_text', text: block.text }
        )
      } else if ('image' in block && block.image) {
        const url = imageBlockToDataUrl(block.image)
        if (url) messageParts.push({ type: 'input_image', image_url: url, detail: 'auto' })
      } else if ('toolUse' in block && block.toolUse) {
        // Flush any pending message parts before the function_call item so
        // ordering (text then tool call) is preserved.
        if (messageParts.length > 0) {
          items.push({ type: 'message', role, content: [...messageParts] })
          messageParts.length = 0
        }
        items.push({
          type: 'function_call',
          call_id: block.toolUse.toolUseId ?? '',
          name: block.toolUse.name ?? '',
          arguments: JSON.stringify(block.toolUse.input ?? {})
        })
      } else if ('toolResult' in block && block.toolResult) {
        if (messageParts.length > 0) {
          items.push({ type: 'message', role, content: [...messageParts] })
          messageParts.length = 0
        }
        items.push({
          type: 'function_call_output',
          call_id: block.toolResult.toolUseId ?? '',
          output: toolResultToString(block.toolResult.content)
        })
      }
      // reasoningContent and other block types are intentionally dropped.
    }

    if (messageParts.length > 0) {
      items.push({ type: 'message', role, content: messageParts })
    }
  }

  return items
}

/** Translate Bedrock tool config into Responses function tools. */
export function toolConfigToResponsesTools(
  toolConfig?: ToolConfiguration
): ResponsesFunctionTool[] | undefined {
  if (!toolConfig?.tools || toolConfig.tools.length === 0) return undefined

  const tools: ResponsesFunctionTool[] = []
  for (const tool of toolConfig.tools) {
    const spec = 'toolSpec' in tool ? tool.toolSpec : undefined
    if (!spec?.name) continue
    const parameters =
      spec.inputSchema && 'json' in spec.inputSchema
        ? (spec.inputSchema.json as Record<string, unknown>)
        : null
    tools.push({
      type: 'function',
      name: spec.name,
      description: spec.description,
      parameters,
      // Responses strict mode requires a fully-closed JSON schema; the app's
      // tool schemas are not authored for that, so disable it.
      strict: false
    })
  }
  return tools.length > 0 ? tools : undefined
}

/** Build the full Responses API request from a Converse-shaped request. */
export function buildResponsesRequest(options: BuildRequestOptions): ResponsesRequest {
  const { modelId, messages, system, toolConfig, inferenceConfig, thinkingMode, disableThinking } =
    options

  const request: ResponsesRequest = {
    model: modelId,
    input: messagesToResponsesInput(messages),
    store: false
  }

  const instructions = systemToInstructions(system)
  if (instructions) request.instructions = instructions

  const tools = toolConfigToResponsesTools(toolConfig)
  if (tools) request.tools = tools

  if (inferenceConfig?.maxTokens) request.max_output_tokens = inferenceConfig.maxTokens

  // GPT-5.5 is a reasoning model. Reasoning models on the Responses API reject
  // `temperature` / `top_p` (the server accepts the request then fails mid-
  // stream with "Premature close"), so we never send sampling params on this
  // path. We always include a reasoning effort; when the user hasn't enabled
  // an explicit thinking budget we default to 'medium'.
  if (!disableThinking) {
    request.reasoning = { effort: mapThinkingToEffort(thinkingMode) ?? 'medium' }
  }

  return request
}

// ---------------------------------------------------------------------------
// Response translation (Responses stream events -> ConverseStreamOutput)
// ---------------------------------------------------------------------------

/**
 * A minimal structural view of the OpenAI Responses stream events we consume.
 * We access fields structurally to avoid coupling to the SDK's large union.
 */
export interface ResponsesStreamEvent {
  type: string
  output_index?: number
  item?: { type?: string; call_id?: string; name?: string; id?: string }
  delta?: string
  response?: {
    status?: string
    incomplete_details?: { reason?: string } | null
    output?: Array<{ type?: string }>
    usage?: {
      input_tokens?: number
      output_tokens?: number
      total_tokens?: number
    }
  }
  [key: string]: unknown
}

/** Mutable state threaded across stream-event translation calls. */
export interface StreamTranslationState {
  /** Which output indices correspond to function_call items (need tool stop). */
  toolCallIndices: Set<number>
  /** Whether we have emitted messageStart yet. */
  started: boolean
  /** Whether any function_call item was seen (drives tool_use stop reason). */
  sawToolCall: boolean
}

export function createStreamState(): StreamTranslationState {
  return { toolCallIndices: new Set(), started: false, sawToolCall: false }
}

/** Map a completed Responses `response` object to a Bedrock stop reason. */
export function mapStopReason(
  response: ResponsesStreamEvent['response'],
  sawToolCall: boolean
): StopReason {
  if (sawToolCall || response?.output?.some((o) => o.type === 'function_call')) {
    return 'tool_use'
  }
  if (response?.status === 'incomplete') {
    if (response.incomplete_details?.reason === 'max_output_tokens') return 'max_tokens'
    if (response.incomplete_details?.reason === 'content_filter') return 'content_filtered'
  }
  return 'end_turn'
}

/**
 * Translate one Responses stream event into zero or more ConverseStreamOutput
 * events. Mirrors Bedrock's event ordering so the renderer's existing parsing
 * (single `toolUse` accumulator, per-block start/stop) works unchanged:
 *
 *  - every output item emits an explicit contentBlockStart (function_call items
 *    carry `start.toolUse`; message/reasoning items carry `start: undefined`,
 *    which resets the renderer's toolUse accumulator between blocks)
 *  - text/argument/reasoning deltas map to contentBlockDelta
 *  - output_item.done maps to contentBlockStop
 *  - response.completed maps to messageStop + metadata
 */
export function translateStreamEvent(
  event: ResponsesStreamEvent,
  state: StreamTranslationState
): ConverseStreamOutput[] {
  const out: ConverseStreamOutput[] = []
  const index = event.output_index ?? 0

  switch (event.type) {
    case 'response.created':
    case 'response.in_progress':
      if (!state.started) {
        state.started = true
        out.push({ messageStart: { role: 'assistant' } } as ConverseStreamOutput)
      }
      break

    case 'response.output_item.added': {
      const itemType = event.item?.type
      if (itemType === 'function_call') {
        state.toolCallIndices.add(index)
        state.sawToolCall = true
        out.push({
          contentBlockStart: {
            start: {
              toolUse: {
                toolUseId: event.item?.call_id ?? event.item?.id ?? `call_${index}`,
                name: event.item?.name ?? ''
              }
            },
            contentBlockIndex: index
          }
        } as ConverseStreamOutput)
      } else {
        // message / reasoning item: explicit start with no toolUse resets the
        // renderer's accumulator so a preceding tool block can't leak state.
        out.push({
          contentBlockStart: { start: undefined, contentBlockIndex: index }
        } as ConverseStreamOutput)
      }
      break
    }

    case 'response.output_text.delta':
      if (typeof event.delta === 'string' && event.delta.length > 0) {
        out.push({
          contentBlockDelta: { delta: { text: event.delta }, contentBlockIndex: index }
        } as ConverseStreamOutput)
      }
      break

    case 'response.function_call_arguments.delta':
      if (typeof event.delta === 'string') {
        out.push({
          contentBlockDelta: {
            delta: { toolUse: { input: event.delta } },
            contentBlockIndex: index
          }
        } as ConverseStreamOutput)
      }
      break

    case 'response.reasoning_summary_text.delta':
    case 'response.reasoning_text.delta':
      if (typeof event.delta === 'string' && event.delta.length > 0) {
        out.push({
          contentBlockDelta: {
            delta: { reasoningContent: { text: event.delta } },
            contentBlockIndex: index
          }
        } as ConverseStreamOutput)
      }
      break

    case 'response.output_item.done':
      out.push({
        contentBlockStop: { contentBlockIndex: index }
      } as ConverseStreamOutput)
      break

    case 'response.completed': {
      const stopReason = mapStopReason(event.response, state.sawToolCall)
      out.push({ messageStop: { stopReason } } as ConverseStreamOutput)
      const usage = event.response?.usage
      out.push({
        metadata: {
          usage: {
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
            totalTokens: usage?.total_tokens ?? 0
          },
          metrics: { latencyMs: 0 }
        }
      } as ConverseStreamOutput)
      break
    }

    case 'response.failed':
    case 'error': {
      const message =
        (event.response && 'error' in event.response
          ? (event.response as { error?: { message?: string } }).error?.message
          : undefined) ||
        (typeof event.message === 'string' ? event.message : undefined) ||
        'OpenAI Responses stream error'
      throw new Error(message)
    }

    default:
      // Ignore other event types (content_part.added/done, reasoning summaries
      // parts, built-in tool events, etc.).
      break
  }

  return out
}

// ---------------------------------------------------------------------------
// Non-streaming response translation (Responses Response -> ConverseOutput)
// ---------------------------------------------------------------------------

/** Structural view of the non-streaming Responses `Response` object. */
export interface ResponsesResult {
  output?: Array<{
    type?: string
    call_id?: string
    id?: string
    name?: string
    arguments?: string
    content?: Array<{ type?: string; text?: string }>
  }>
  status?: string
  incomplete_details?: { reason?: string } | null
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number }
}

export interface ConverseLikeOutput {
  output: { message: { role: 'assistant'; content: ContentBlock[] } }
  stopReason: StopReason
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  metrics: { latencyMs: number }
}

/**
 * Translate a non-streaming Responses result into the ConverseCommandOutput-like
 * shape the app consumes (used by title/structured/background flows that call
 * the non-streaming path).
 */
export function translateResponse(result: ResponsesResult): ConverseLikeOutput {
  const content: ContentBlock[] = []
  let sawToolCall = false

  for (const item of result.output ?? []) {
    if (item.type === 'message') {
      for (const part of item.content ?? []) {
        if (part.type === 'output_text' && typeof part.text === 'string' && part.text.length > 0) {
          content.push({ text: part.text })
        }
      }
    } else if (item.type === 'function_call') {
      sawToolCall = true
      let input: unknown = {}
      try {
        input = item.arguments ? JSON.parse(item.arguments) : {}
      } catch {
        input = {}
      }
      content.push({
        toolUse: {
          toolUseId: item.call_id ?? item.id ?? '',
          name: item.name ?? '',
          input: input as any
        }
      })
    }
    // reasoning items dropped (see reasoning note).
  }

  if (content.length === 0) {
    content.push({ text: '' })
  }

  const usage = result.usage
  return {
    output: { message: { role: 'assistant', content } },
    stopReason: mapStopReason(
      {
        status: result.status,
        incomplete_details: result.incomplete_details,
        output: result.output
      },
      sawToolCall
    ),
    usage: {
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0
    },
    metrics: { latencyMs: 0 }
  }
}
