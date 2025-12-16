import mammoth from 'mammoth';
import PDFParser from 'pdf2json';

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser();

    pdfParser.on('pdfParser_dataError', (errData: any) => {
      reject(new Error(`Failed to extract text from PDF: ${errData.parserError}`));
    });

    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        // Extract text from all pages
        let text = '';
        if (pdfData.Pages) {
          pdfData.Pages.forEach((page: any) => {
            if (page.Texts) {
              page.Texts.forEach((textItem: any) => {
                if (textItem.R) {
                  textItem.R.forEach((r: any) => {
                    if (r.T) {
                      try {
                        text += decodeURIComponent(r.T) + ' ';
                      } catch (e) {
                        // If decoding fails, use raw text
                        text += r.T + ' ';
                      }
                    }
                  });
                }
              });
              text += '\n';
            }
          });
        }
        
        const trimmedText = text.trim();
        if (!trimmedText || trimmedText.length < 10) {
          reject(new Error('PDF appears to be empty or contains only images/unreadable text. Try a text-based PDF.'));
        } else {
          resolve(trimmedText);
        }
      } catch (error) {
        reject(new Error(`Failed to parse PDF data: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

export async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    throw new Error(`Failed to extract text from DOCX: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const extension = filename.toLowerCase().split('.').pop();
  
  if (extension === 'pdf') {
    return extractTextFromPDF(buffer);
  } else if (extension === 'docx') {
    return extractTextFromDOCX(buffer);
  } else {
    throw new Error(`Unsupported file type: ${extension}`);
  }
}
