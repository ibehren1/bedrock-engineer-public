import type {
  ConverseCommandOutput,
  ConverseStreamCommandOutput,
  ConverseStreamOutput
} from '@aws-sdk/client-bedrock-runtime'
import { createMantleClient } from './client'
import {
  buildResponsesRequest,
  createStreamState,
  translateResponse,
  translateStreamEvent,
  type ResponsesRequest,
  type ResponsesStreamEvent,
  type ResponsesResult
} from './translator'
import type { CallConverseAPIProps, ServiceContext } from '../types'
import { createCategoryLogger } from '../../../../common/logger'

const responsesLogger = createCategoryLogger('bedrock:mantle:responses')

/**
 * Extract the useful fields from an OpenAI SDK error (APIError) for logging.
 * The mantle endpoint surfaces server-side rejection detail in `error`/`code`.
 */
function describeError(error: any): Record<string, unknown> {
  return {
    name: error?.name,
    status: error?.status,
    code: error?.code,
    type: error?.type,
    message: error?.message,
    // APIError exposes the parsed body under `error`; include it verbatim.
    body: error?.error ?? error?.response?.data
  }
}

/**
 * Build a compact, log-safe view of the outgoing request (truncating long text
 * so tool/image payloads don't flood the log) to diagnose server rejections.
 */
function describeRequest(request: any): Record<string, unknown> {
  return {
    model: request.model,
    hasInstructions: !!request.instructions,
    inputItemCount: Array.isArray(request.input) ? request.input.length : 0,
    inputItemTypes: Array.isArray(request.input) ? request.input.map((i: any) => i.type) : [],
    toolNames: Array.isArray(request.tools) ? request.tools.map((t: any) => t.name) : [],
    max_output_tokens: request.max_output_tokens,
    reasoning: request.reasoning,
    temperature: request.temperature,
    top_p: request.top_p,
    store: request.store
  }
}

/**
 * Service that fulfills the app's Converse contract for OpenAI GPT models that
 * are only available through the bedrock-mantle Responses API (e.g. GPT-5.5).
 *
 * It exposes the same `converse` / `converseStream` surface as ConverseService
 * so BedrockService can route to it transparently. All translation between the
 * Converse shapes and the Responses API lives in translator.ts.
 */
export class ResponsesService {
  constructor(private context: ServiceContext) {}

  private buildRequest(props: CallConverseAPIProps): ResponsesRequest {
    const inferenceConfig = props.inferenceConfig ?? this.context.store.get('inferenceParams')
    const thinkingMode = this.context.store.get('thinkingMode')

    return buildResponsesRequest({
      modelId: props.modelId,
      messages: props.messages,
      system: props.system,
      toolConfig: props.toolConfig,
      inferenceConfig: {
        maxTokens: inferenceConfig?.maxTokens,
        temperature: inferenceConfig?.temperature,
        topP: inferenceConfig?.topP
      },
      thinkingMode: thinkingMode as any,
      disableThinking: props.disableThinking
    })
  }

  /**
   * Non-streaming Responses call, returned in a ConverseCommandOutput-compatible
   * shape (output.message.content / stopReason / usage / metrics).
   */
  async converse(props: CallConverseAPIProps): Promise<ConverseCommandOutput> {
    const client = await createMantleClient(this.context.store.get('aws'))
    const request = this.buildRequest(props)

    responsesLogger.debug('Sending non-stream responses request', describeRequest(request))

    let result: ResponsesResult
    try {
      result = (await client.responses.create({
        ...(request as any),
        stream: false
      })) as unknown as ResponsesResult
    } catch (error: any) {
      responsesLogger.error('Non-stream responses request failed', describeError(error))
      throw error
    }

    const translated = translateResponse(result)
    return {
      $metadata: {},
      output: translated.output,
      stopReason: translated.stopReason,
      usage: translated.usage,
      metrics: translated.metrics
    } as unknown as ConverseCommandOutput
  }

  /**
   * Streaming Responses call. Returns an object with a `stream` async-iterable
   * of ConverseStreamOutput events, matching ConverseStreamCommandOutput so the
   * Express `/converse/stream` route can iterate it unchanged.
   */
  async converseStream(props: CallConverseAPIProps): Promise<ConverseStreamCommandOutput> {
    const client = await createMantleClient(this.context.store.get('aws'))
    const request = this.buildRequest(props)

    responsesLogger.debug('Sending stream responses request', describeRequest(request))

    let openaiStream: AsyncIterable<unknown>
    try {
      openaiStream = (await client.responses.create({
        ...(request as any),
        stream: true
      })) as unknown as AsyncIterable<unknown>
    } catch (error: any) {
      responsesLogger.error('Stream responses request failed to open', describeError(error))
      throw error
    }

    async function* toConverseStream(): AsyncGenerator<ConverseStreamOutput> {
      const state = createStreamState()
      let eventCount = 0
      let firstEventType: string | undefined
      let lastEventType: string | undefined
      // Set once we've seen a terminal Responses event. After that, the model
      // output is complete and we've already emitted messageStop + metadata,
      // so a socket close is a normal end — not a failure.
      let terminated = false
      try {
        for await (const event of openaiStream) {
          const e = event as ResponsesStreamEvent
          eventCount++
          if (!firstEventType) {
            firstEventType = e.type
            responsesLogger.debug('First responses stream event received', { type: e.type })
          }
          lastEventType = e.type
          if (e.type === 'response.completed' || e.type === 'response.incomplete') {
            terminated = true
          }
          const translated = translateStreamEvent(e, state)
          for (const item of translated) {
            yield item
          }
        }
        responsesLogger.debug('Responses stream completed', { eventCount, lastEventType })
      } catch (error: any) {
        // The bedrock-mantle endpoint closes the socket after the terminal
        // event without the `data: [DONE]` sentinel the OpenAI SDK waits for,
        // so the SDK's iterator throws ERR_STREAM_PREMATURE_CLOSE even though
        // the response finished cleanly. If we already saw a terminal event,
        // swallow that specific close and end the stream normally.
        if (terminated && error?.code === 'ERR_STREAM_PREMATURE_CLOSE') {
          responsesLogger.debug('Ignoring premature close after terminal event', {
            eventCount,
            lastEventType
          })
          return
        }
        // Genuine failures (server 500 / mid-stream break) propagate.
        responsesLogger.error('Stream responses iteration failed', {
          ...describeError(error),
          eventCount,
          firstEventType,
          lastEventType
        })
        throw error
      }
    }

    return {
      $metadata: {},
      stream: toConverseStream()
    } as unknown as ConverseStreamCommandOutput
  }
}
