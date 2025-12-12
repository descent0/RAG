declare module 'pdf2json' {
  class PDFParser {
    on(event: string, callback: (data: any) => void): void;
    parseBuffer(buffer: Buffer): void;
  }
  export = PDFParser;
}
