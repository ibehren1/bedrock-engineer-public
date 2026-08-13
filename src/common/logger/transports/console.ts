import { transports } from 'winston'
import { LoggerConfig } from '../config'
import { consoleLogFormat } from '../formatters'

/**
 * Create console transport for winston logger
 * With colorized output for better readability
 */
export const createConsoleTransport = (config: LoggerConfig) => {
  return new transports.Console({
    level: config.level,
    format: consoleLogFormat
  })
}
