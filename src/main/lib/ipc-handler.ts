import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { IPCChannels, IPCResult } from '../../types/ipc'
import { log, createCategoryLogger } from '../../common/logger'

type IpcHandlerFn<C extends IPCChannels> = (
  event: IpcMainInvokeEvent,
  ...args: any[]
) => Promise<IPCResult<C>> | IPCResult<C>

/**
 * 型安全なIPCハンドラー登録用ラッパー
 */
export function registerIpcHandler<C extends IPCChannels>(
  channel: C,
  handler: IpcHandlerFn<C>,
  options?: {
    loggerCategory?: string
  }
): void {
  const logger = options?.loggerCategory ? createCategoryLogger(options.loggerCategory) : log

  ipcMain.handle(channel, async (event, ...args) => {
    try {
      logger.debug(`IPC handler invoked: ${channel}`, {
        channel,
        argsLength: args.length
      })

      const result = await handler(event, ...args)

      logger.debug(`IPC handler completed: ${channel}`, {
        channel,
        success: true
      })

      return result
    } catch (error) {
      logger.error(`IPC handler error: ${channel}`, {
        channel,
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  })

  logger.verbose(`IPC handler registered: ${channel}`)
}

/**
 * 一括登録用ユーティリティ
 */
export function registerIpcHandlers<T extends Record<IPCChannels, IpcHandlerFn<any>>>(
  handlers: Partial<T>,
  options?: {
    loggerCategory?: string
  }
): void {
  Object.entries(handlers).forEach(([channel, handler]) => {
    registerIpcHandler(channel as IPCChannels, handler, options)
  })
}

/**
 * ログ専用のIPCハンドラー（onを使用）
 */
export function registerLogHandler(): void {
  const logger = log

  ipcMain.on('logger:log', (_event, logData) => {
    const { level, message, process: processType, category, ...meta } = logData

    // If a category is specified, use a category logger
    const categoryLogger = category ? createCategoryLogger(category) : logger

    // Include process type in metadata for filtering
    const metaWithProcess = {
      ...meta,
      process: processType || 'unknown'
    }

    switch (level) {
      case 'error':
        categoryLogger.error(message, metaWithProcess)
        break
      case 'warn':
        categoryLogger.warn(message, metaWithProcess)
        break
      case 'info':
        categoryLogger.info(message, metaWithProcess)
        break
      case 'debug':
        categoryLogger.debug(message, metaWithProcess)
        break
      case 'verbose':
        categoryLogger.verbose(message, metaWithProcess)
        break
      default:
        categoryLogger.info(message, metaWithProcess)
    }
  })

  logger.verbose('Log IPC handler registered')
}
