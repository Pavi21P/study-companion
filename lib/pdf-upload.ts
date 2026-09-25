export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function pdfFilename(encoded: string | null): string | null {
  if (!encoded || encoded.length > 2048) return null;
  try {
    const name = decodeURIComponent(encoded).trim();
    const hasControl = Array.from(name).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
    if (!name || name.length > 200 || !/\.pdf$/i.test(name) || /[/\\]/.test(name) || hasControl) return null;
    return name;
  } catch { return null; }
}

// Envelope checks only. PDF.js will validate the document during extraction.
export function hasPdfEnvelope(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder('ascii');
  return /^%PDF-(?:1\.[0-7]|2\.0)[\r\n]/.test(decoder.decode(bytes.subarray(0, 12)))
    && /%%EOF\s*$/.test(decoder.decode(bytes.subarray(Math.max(0, bytes.length - 1024))));
}
