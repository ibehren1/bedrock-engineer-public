import { Server, Socket } from 'socket.io'
import { ToolInput } from '../../../../types/tools'
import { createCategoryLogger } from '../../../../common/logger'

const toolLogger = createCategoryLogger('sonic:tool-executor')

export interface ToolExecutionResponse {
  success: boolean
  result?: any
  error?: string
}

export interface ToolExecutionRequest {
  requestId: string
  type: string
  [key: string]: any
}

export class SonicToolExecutor {
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: any) => void
      reject: (reason: any) => void
      timeout: NodeJS.Timeout
    }
  >()

  constructor(private io: Server) {
    toolLogger.info('SonicToolExecutor initialized')
  }

  /**
   * Execute a tool via Socket.io communication with frontend
   */
  async executeToolViaSocket(toolInput: ToolInput): Promise<any> {
    const requestId = this.generateRequestId()

    toolLogger.debug('Executing tool via socket', {
      toolName: toolInput.type,
      requestId
    })

    return new Promise((resolve, reject) => {
      // Find active socket connection
      const connectedSocket = this.findActiveSocket()

      if (!connectedSocket) {
        toolLogger.error('No active socket connection for tool execution')
        reject(new Error('No active socket connection for tool execution'))
        return
      }

      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId)
        toolLogger.error('Tool execution timeout', {
          toolName: toolInput.type,
          requestId,
          timeoutMs: 30000
        })
        reject(new Error(`Tool execution timeout for ${toolInput.type}`))
      }, 30000) // 30 seconds timeout

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout
      })

      // Send tool execution request
      const toolRequest: ToolExecutionRequest = {
        ...toolInput,
        requestId
      }

      toolLogger.debug('Sending tool execution request', {
        toolName: toolInput.type,
        requestId,
        socketId: connectedSocket.id
      })

      connectedSocket.emit('tool:executeRequest', toolRequest)
    })
  }

  /**
   * Handle tool execution response from frontend
   */
  handleToolExecutionResponse(requestId: string, response: ToolExecutionResponse): void {
    const pendingRequest = this.pendingRequests.get(requestId)

    if (!pendingRequest) {
      toolLogger.warn('Received response for unknown request', { requestId })
      return
    }

    toolLogger.debug('Received tool execution response', {
      requestId,
      success: response.success
    })

    // Clean up
    clearTimeout(pendingRequest.timeout)
    this.pendingRequests.delete(requestId)

    // Resolve or reject the pending promise
    if (response.success) {
      toolLogger.info('Tool execution completed successfully', { requestId })
      pendingRequest.resolve(response.result)
    } else {
      toolLogger.error('Tool execution failed', {
        requestId,
        error: response.error
      })
      pendingRequest.reject(new Error(response.error || 'Tool execution failed'))
    }
  }

  /**
   * Register Socket.io event handlers for tool execution
   */
  registerSocketHandlers(socket: Socket): void {
    toolLogger.debug('Registering tool execution handlers for socket', {
      socketId: socket.id
    })

    // Handle tool execution responses
    socket.on('tool:executeResponse', (response: ToolExecutionResponse & { requestId: string }) => {
      this.handleToolExecutionResponse(response.requestId, response)
    })

    // Clean up pending requests when socket disconnects
    socket.on('disconnect', () => {
      toolLogger.debug('Cleaning up pending requests for disconnected socket', {
        socketId: socket.id,
        pendingCount: this.pendingRequests.size
      })

      // Reject all pending requests from this socket
      this.pendingRequests.forEach((pendingRequest) => {
        clearTimeout(pendingRequest.timeout)
        pendingRequest.reject(new Error('Socket connection lost during tool execution'))
      })
      this.pendingRequests.clear()
    })
  }

  /**
   * Find an active socket connection
   */
  private findActiveSocket(): Socket | null {
    const activeSockets = Array.from(this.io.sockets.sockets.values())
    const connectedSocket = activeSockets.find((socket) => socket.connected)

    if (!connectedSocket) {
      toolLogger.warn('No active socket connections found', {
        totalSockets: activeSockets.length
      })
    }

    return connectedSocket || null
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get statistics about pending requests
   */
  getStatistics(): {
    pendingRequestsCount: number
    activeSocketsCount: number
  } {
    return {
      pendingRequestsCount: this.pendingRequests.size,
      activeSocketsCount: Array.from(this.io.sockets.sockets.values()).filter((s) => s.connected)
        .length
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    toolLogger.info('Disposing SonicToolExecutor', {
      pendingRequestsCount: this.pendingRequests.size
    })

    // Clean up all pending requests
    this.pendingRequests.forEach((pendingRequest) => {
      clearTimeout(pendingRequest.timeout)
      pendingRequest.reject(new Error('SonicToolExecutor disposed'))
    })

    this.pendingRequests.clear()
  }
}
