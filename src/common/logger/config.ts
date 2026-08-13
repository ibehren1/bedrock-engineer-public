/**
 * Logger configuration
 */

export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug',
  VERBOSE: 'verbose'
}

export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS]

export interface LoggerConfig {
  level: LogLevel
  fileLogEnabled: boolean
  consoleLogEnabled: boolean
  maxSize: string
  maxFiles: number
  logDir: string
  logFilePrefix: string
}

/**
 * Default logger configuration
 */
export const defaultLoggerConfig: LoggerConfig = {
  level: (process.env.NODE_ENV === 'development' ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO) as LogLevel,
  fileLogEnabled: true,
  consoleLogEnabled: true,
  maxSize: '10m',
  maxFiles: 5,
  logDir: '', // Will be set during initialization
  logFilePrefix: 'bedrock-engineer'
}
