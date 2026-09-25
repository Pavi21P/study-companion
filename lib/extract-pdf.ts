import { MAX_PAGES, MAX_TEXT, extractionErrors, type ExtractedPage, type ExtractionErrorCode } from './extracted-text';

export class PdfExtractionError extends Error {
  code: ExtractionErrorCode;
  constructor(code: ExtractionErrorCode) { super(extractionErrors[code]); this.code = code; }
}

// Invoked only from a client event. PDF.js and its worker stay out of SSR.
export async function extractPdf(data: Uint8Array, progress: (page: number, total: number) => void): Promise<ExtractedPage[]> {
  const pdfjs = await import('pdfjs-dist');
  const assets = `/pdfjs/${pdfjs.version}/`;
  // Serve raw worker code from public assets, without dev-page transforms.
  pdfjs.GlobalWorkerOptions.workerSrc = `${assets}pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({ data, stopAtErrors: true, useSystemFonts: true,
    cMapUrl: `${assets}cmaps/`, cMapPacked: true, standardFontDataUrl: `${assets}standard_fonts/`, wasmUrl: `${assets}wasm/` });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const pdf = await task.promise;
        if (pdf.numPages > MAX_PAGES) throw new PdfExtractionError('pages');
        const pages: ExtractedPage[] = [];
        let total = 0;
        for (let number = 1; number <= pdf.numPages; number++) {
          progress(number, pdf.numPages);
          const page = await pdf.getPage(number);
          const reader = page.streamTextContent().getReader();
          const parts: string[] = [];
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            for (const item of value.items) {
              if (!('str' in item)) continue;
              const part = item.str + (item.hasEOL ? '\n' : ' ');
              total += part.length;
              if (total > MAX_TEXT) { await reader.cancel(); throw new PdfExtractionError('text'); }
              parts.push(part);
            }
          }
          pages.push({ page: number, text: parts.join('').trim() });
          page.cleanup();
        }
        if (!pages.some(page => page.text)) throw new PdfExtractionError('empty');
        return pages;
      })(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new PdfExtractionError('timeout')), 60_000);
      }),
    ]);
  } catch (error) {
    if (error instanceof PdfExtractionError) throw error;
    if (error instanceof Error && error.name === 'PasswordException') throw new PdfExtractionError('encrypted');
    throw new PdfExtractionError('invalid');
  } finally {
    clearTimeout(timeout);
    await task.destroy();
  }
}
