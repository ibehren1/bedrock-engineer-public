import { InputDetectionPattern } from './types'

/**
 * Output pattern matching shared by the host shell path (CommandService) and the
 * Docker sandbox exec path. Both watch a child process's output for the same three
 * things, so the patterns live here rather than being duplicated per executor.
 */

// 入力待ち状態を検出するパターン
export const inputDetectionPatterns: InputDetectionPattern[] = [
  {
    pattern: /\? .+\?.*$/m, // inquirer形式の質問
    promptExtractor: (output) => {
      const match = output.match(/\? (.+\?.*$)/m)
      return match ? match[1] : output
    }
  },
  {
    pattern: /[^:]+: $/m, // 基本的なプロンプト（例: "Enter name: "）
    promptExtractor: (output) => {
      const lines = output.split('\n')
      return lines[lines.length - 1]
    }
  },
  {
    // apt/dpkg style confirmations, which a bare ubuntu sandbox hits constantly.
    // These end in "[Y/n]" or "[y/N]" rather than a colon, so the two patterns
    // above miss them.
    pattern: /\[[Yy]\/[Nn]\]\??\s*$/m,
    promptExtractor: (output) => {
      const lines = output.trimEnd().split('\n')
      return lines[lines.length - 1]
    }
  }
]

// サーバー起動状態を示すパターン
export const serverReadyPatterns = [
  'listening',
  'ready',
  'started',
  'running',
  'live',
  'compiled successfully',
  'compiled',
  'waiting for file changes',
  'development server running'
]

// エラーを示すパターン
export const errorPatterns = [
  'EADDRINUSE',
  'Error:',
  'error:',
  'ERR!',
  'app crashed',
  'Cannot find module',
  'command not found',
  'Failed to compile',
  'Syntax error:',
  'TypeError:',
  // Windows固有のエラーパターン
  'The system cannot find the file specified',
  'Access is denied',
  'The filename, directory name, or volume label syntax is incorrect',
  'is not recognized as an internal or external command',
  'The process cannot access the file because it is being used by another process',
  'ENOENT',
  'EACCES'
]

/**
 * 入力待ち状態かどうかを判定
 */
export const detectWaitingForInput = (output: string): { isWaiting: boolean; prompt?: string } => {
  for (const pattern of inputDetectionPatterns) {
    if (output.match(pattern.pattern)) {
      const prompt = pattern.promptExtractor ? pattern.promptExtractor(output) : output
      return { isWaiting: true, prompt }
    }
  }
  return { isWaiting: false }
}

/**
 * サーバーが正常に起動しているかチェック
 */
export const detectServerReady = (output: string): boolean =>
  serverReadyPatterns.some((pattern) => output.toLowerCase().includes(pattern.toLowerCase()))

/**
 * エラーチェック
 */
export const detectErrors = (stdout: string, stderr: string): boolean => {
  if (errorPatterns.some((pattern) => stdout.includes(pattern) || stderr.includes(pattern))) {
    return true
  }

  // クラッシュ状態のチェック
  if (stdout.includes('app crashed') && !stdout.includes('waiting for file changes')) {
    return true
  }

  return false
}
