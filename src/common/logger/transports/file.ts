import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import fs from 'fs'
import { LoggerConfig } from '../config'
import { mainLogFormat } from '../formatters'

/**
 * Create file transport for winston logger
 * Uses daily rotate file to manage log rotation
 */
export const createFileTransport = (config: LoggerConfig) => {
  // Ensure log directory exists
  if (!fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true })
  }

  return new DailyRotateFile({
    dirname: config.logDir,
    filename: `${config.logFilePrefix}-%DATE%.log`,
    datePattern: 'YYYY-MM-DD',
    maxSize: config.maxSize,
    maxFiles: config.maxFiles,
    level: config.level,
    format: mainLogFormat
  })
}

/**
 * Get log file paths for the current day and previous days
 */
export const getLogFilePaths = (config: LoggerConfig): string[] => {
  if (!fs.existsSync(config.logDir)) {
    return []
  }

  const files = fs.readdirSync(config.logDir)
  return files
    .filter((file) => file.startsWith(config.logFilePrefix) && file.endsWith('.log'))
    .map((file) => path.join(config.logDir, file))
    .sort()
    .reverse() // Most recent first
}
