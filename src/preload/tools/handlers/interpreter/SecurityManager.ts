/**
 * Simplified Security manager for CodeInterpreter
 * Fixed security settings - no more complex configuration!
 */

import { ExecutionConfig } from './types'
import { ToolLogger } from '../../base/types'

/**
 * Base security constraints - memory and CPU are configurable
 */
const BASE_DOCKER_SECURITY_ARGS = [
  '--rm', // Auto-remove container
  '--network=none', // No network access
  '--tmpfs=/tmp:rw,size=100m', // Writable temporary filesystem
  '--tmpfs=/var/tmp:rw,size=50m' // Additional temp space
  // Memory and CPU limits are added dynamically based on user configuration
]

/**
 * Simplified Security manager class
 */
export class SecurityManager {
  private logger: ToolLogger

  constructor(logger: ToolLogger) {
    this.logger = logger
  }

  /**
   * Validate execution config and apply security constraints
   */
  validateExecutionConfig(config?: Partial<ExecutionConfig>): {
    isValid: boolean
    errors: string[]
    sanitizedConfig: ExecutionConfig
  } {
    const errors: string[] = []

    // Default configuration
    const sanitizedConfig: ExecutionConfig = {
      timeout: 30, // Default: 30 seconds
      memoryLimit: '256m', // Default: 256MB
      cpuLimit: 0.5 // Default: 50% CPU
    }

    // Apply user configuration if provided
    if (config) {
      // Validate and apply timeout
      if (config.timeout !== undefined) {
        if (typeof config.timeout === 'number' && config.timeout > 0 && config.timeout <= 600) {
          sanitizedConfig.timeout = config.timeout
        } else {
          errors.push('Timeout must be between 1 and 600 seconds')
        }
      }

      // Validate and apply memory limit
      if (config.memoryLimit !== undefined) {
        const validMemoryLimits = ['128m', '256m', '512m', '1g', '2g']
        if (
          typeof config.memoryLimit === 'string' &&
          validMemoryLimits.includes(config.memoryLimit)
        ) {
          sanitizedConfig.memoryLimit = config.memoryLimit
        } else {
          errors.push(`Memory limit must be one of: ${validMemoryLimits.join(', ')}`)
        }
      }

      // Validate and apply CPU limit
      if (config.cpuLimit !== undefined) {
        if (typeof config.cpuLimit === 'number' && config.cpuLimit > 0 && config.cpuLimit <= 4.0) {
          sanitizedConfig.cpuLimit = config.cpuLimit
        } else {
          errors.push('CPU limit must be between 0.1 and 4.0')
        }
      }

      // Copy environment if provided
      if (config.environment) {
        sanitizedConfig.environment = config.environment
      }
    }

    this.logger.debug('Execution config validated', {
      providedConfig: config,
      sanitizedConfig,
      hasErrors: errors.length > 0
    })

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedConfig
    }
  }

  /**
   * Sanitize code (basic checks only)
   */
  sanitizeCode(
    code: string,
    _language: string
  ): {
    sanitizedCode: string
    warnings: string[]
  } {
    const warnings: string[] = []

    // Basic security checks
    if (code.includes('__import__')) {
      warnings.push('Dynamic imports detected - use with caution')
    }

    if (code.includes('exec(') || code.includes('eval(')) {
      warnings.push('Dynamic code execution detected - use with caution')
    }

    if (code.includes('subprocess') || code.includes('os.system')) {
      warnings.push('System command execution detected - will be blocked by Docker')
    }

    // Return code as-is (Docker will handle the security)
    return {
      sanitizedCode: code,
      warnings
    }
  }

  /**
   * Generate Docker security arguments with user configuration
   */
  generateDockerSecurityArgs(config?: ExecutionConfig): string[] {
    const args = [...BASE_DOCKER_SECURITY_ARGS]

    if (config) {
      // Add memory limit
      args.push(`--memory=${config.memoryLimit}`)

      // Add CPU limit
      args.push(`--cpus=${config.cpuLimit}`)
    } else {
      // Default values
      args.push('--memory=256m')
      args.push('--cpus=0.5')
    }

    return args
  }
}
