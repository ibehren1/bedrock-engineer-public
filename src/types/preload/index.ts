import { file } from '../../preload/file'

declare global {
  interface Window {
    file: typeof file
  }
}

export {}
