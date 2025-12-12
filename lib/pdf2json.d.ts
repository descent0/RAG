declare module 'pdf2json' {
  class PDFParser {
    on(event: 'pdfParser_dataError', handler: (errData: any) => void): void;
    on(event: 'pdfParser_dataReady', handler: (pdfData: any) => void): void;
    parseBuffer(buffer: Buffer): void;
  }
  export default PDFParser;
}
