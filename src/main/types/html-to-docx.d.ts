declare module 'html-to-docx' {
  /**
   * Convert an HTML string to a .docx document.
   * Returns a Buffer/ArrayBuffer in Node environments.
   */
  export default function HTMLtoDOCX(
    htmlString: string,
    headerHTMLString?: string | null,
    documentOptions?: Record<string, unknown>,
    footerHTMLString?: string | null
  ): Promise<Buffer | ArrayBuffer>
}
