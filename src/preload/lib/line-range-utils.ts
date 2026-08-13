/**
 * Line range utilities for file and directory operations
 */

export interface LineRange {
  from?: number
  to?: number
}

/**
 * Filter text content by specified line range
 * @param content - The text content to filter
 * @param lineRange - The line range specification
 * @returns Filtered content
 */
export function filterByLineRange(content: string, lineRange?: LineRange): string {
  if (!lineRange) return content

  const lines = content.split('\n')
  const from = Math.max(1, lineRange.from || 1)
  const to = Math.min(lines.length, lineRange.to || lines.length)

  // Convert 1-based to 0-based array indices and slice
  return lines.slice(from - 1, to).join('\n')
}

/**
 * Generate line range information string
 * @param totalLines - Total number of lines in the content
 * @param lineRange - The line range specification
 * @returns Line range information string
 */
export function getLineRangeInfo(totalLines: number, lineRange?: LineRange): string {
  if (!lineRange) return ''

  const from = lineRange.from || 1
  const to = lineRange.to || totalLines

  return ` (lines ${from} to ${Math.min(to, totalLines)})`
}

/**
 * Validate line range parameters
 * @param lineRange - The line range to validate
 * @returns Array of validation error messages
 */
export function validateLineRange(lineRange?: LineRange): string[] {
  const errors: string[] = []

  if (!lineRange) return errors

  if (lineRange.from !== undefined) {
    if (typeof lineRange.from !== 'number' || lineRange.from < 1) {
      errors.push('Line range "from" must be a positive integer')
    }
  }

  if (lineRange.to !== undefined) {
    if (typeof lineRange.to !== 'number' || lineRange.to < 1) {
      errors.push('Line range "to" must be a positive integer')
    }
  }

  if (lineRange.from !== undefined && lineRange.to !== undefined && lineRange.from > lineRange.to) {
    errors.push('Line range "from" must be less than or equal to "to"')
  }

  return errors
}
