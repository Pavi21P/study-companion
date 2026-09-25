export const MAX_PAGES = 100;
export const MAX_TEXT = 150_000;
export type ExtractedPage = { page: number; text: string };
export type PassageInput = { location: number; content: string };

export function validatePages(value: unknown): ExtractedPage[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MAX_PAGES) return null;
  let total = 0;
  const pages: ExtractedPage[] = [];
  for (const [index, raw] of value.entries()) {
    if (!raw || typeof raw !== 'object' || raw.page !== index + 1 || typeof raw.text !== 'string') return null;
    total += raw.text.length;
    if (total > MAX_TEXT || raw.text.includes(String.fromCharCode(0))) return null;
    pages.push({ page: index + 1, text: raw.text.trim() });
  }
  return pages.some(page => page.text) ? pages : null;
}

// Deterministic, non-overlapping passages never cross a page boundary.
export function makePassages(pages: ExtractedPage[]): PassageInput[] {
  const passages: PassageInput[] = [];
  for (const page of pages) {
    let text = page.text.trim();
    while (text) {
      let end = Math.min(2000, text.length);
      if (end < text.length) {
        const boundary = text.lastIndexOf(' ', end);
        if (boundary > 1000) end = boundary;
        const code = text.charCodeAt(end - 1);
        if (code >= 0xd800 && code <= 0xdbff) end--;
      }
      passages.push({ location: page.page, content: text.slice(0, end) });
      text = text.slice(end).trimStart();
    }
  }
  return passages;
}

export const extractionErrors = {
  encrypted: 'This PDF is password-protected. Export an unlocked copy and upload it again.',
  invalid: 'This PDF could not be read. Export a fresh PDF and try again.',
  empty: 'No readable text was found. This may be a scanned or empty PDF. OCR is not supported; choose a text-based PDF.',
  pages: 'This PDF has more than 100 pages. Split it into smaller documents.',
  text: 'This PDF contains more than 150,000 characters. Split it into smaller documents.',
  timeout: 'Text extraction took too long. Try a smaller PDF.',
} as const;
export type ExtractionErrorCode = keyof typeof extractionErrors;
