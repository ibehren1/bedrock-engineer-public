export class ObjectExt {
  static exists(obj: unknown): boolean {
    return obj !== undefined && obj !== null
  }

  static checkArgument(condition: boolean, message: string): void {
    if (!condition) {
      throw new TypeError(message)
    }
  }

  static checkExists(obj: unknown, message: string): void {
    if (!ObjectExt.exists(obj)) {
      throw new TypeError(message)
    }
  }
}
