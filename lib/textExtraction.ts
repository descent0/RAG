export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // ✅ Dynamic import (fixes Next.js build error)
  const PDFParser = (await import('pdf2json')).default;

  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(
        new Error(
          `Failed to extract text from PDF: ${errData?.parserError || 'Unknown error'}`
        )
      );
    });

    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        let text = '';

        if (pdfData?.Pages) {
          pdfData.Pages.forEach((page: any) => {
            page.Texts?.forEach((textItem: any) => {
              textItem.R?.forEach((r: any) => {
                if (r?.T) {
                  try {
                    text += decodeURIComponent(r.T) + ' ';
                  } catch {
                    text += r.T + ' ';
                  }
                }
              });
            });
            text += '\n';
          });
        }

        const trimmedText = text.trim();

        if (!trimmedText || trimmedText.length < 10) {
          reject(
            new Error(
              'PDF appears to be empty or image-based (scanned PDF).'
            )
          );
        } else {
          resolve(trimmedText);
        }
      } catch (error) {
        reject(
          new Error(
            `Failed to parse PDF data: ${
              error instanceof Error ? error.message : 'Unknown error'
            }`
          )
        );
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  // ✅ Dynamic import (safe for Next.js)
  const mammoth = await import('mammoth');

  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    throw new Error(
      `Failed to extract text from DOCX: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    );
  }
}

export async function extractText(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const extension = filename.toLowerCase().split('.').pop();

  if (extension === 'pdf') {
    return extractTextFromPDF(buffer);
  }

  if (extension === 'docx') {
    return extractTextFromDOCX(buffer);
  }

  throw new Error(`Unsupported file type: ${extension}`);
}
