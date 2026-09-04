import path from 'path'

/**
 * True when `target` is `parent` itself or sits somewhere beneath it.
 *
 * Used to keep generated paths (sandbox bind mounts, attachment writes) inside the folder
 * that owns them, so a crafted name cannot reach the rest of the filesystem.
 */
export const isInside = (target: string, parent: string): boolean => {
  const relative = path.relative(parent, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
