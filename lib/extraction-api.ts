import { validatePages, makePassages, extractionErrors, type ExtractionErrorCode } from './extracted-text.ts';
import type { extractionStore } from './extraction-store';
type Deps = {
  user: () => Promise<{ userId: string } | null>;
  store: () => ReturnType<typeof extractionStore>;
  files: () => Pick<R2Bucket, 'get' | 'head'> | undefined;
};
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });

export function extractionApi(deps: Deps) {
  return async (request: Request, id: string) => {
    const user = await deps.user();
    if (!user) return json({ error: 'Sign in to access this document.' }, 401);
    if (request.method === 'POST' && (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site')) return json({ error: 'Use your Study Companion course page.' }, 403);
    try {
      const store = deps.store();
      const source = await store.get(user.userId, id);
      if (!source) return json({ error: 'Document not found.' }, 404);
      const files = deps.files();
      if (!files) return json({ error: 'Original files are unavailable. Saved passages and manual quizzes remain available.' }, 503);
      if (request.method === 'GET') {
        const object = await files.get(source.object_key);
        if (!object) return json({ error: 'The original file is missing. Upload it again.' }, 409);
        return new Response(object.body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="source.pdf"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({ error: 'Send extraction details as JSON.' }, 415);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Extraction details are required.' }, 400);
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 1_000_000) { await reader.cancel(); return json({ error: 'Extracted text is too large.' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let body: Record<string, unknown>;
      try {
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid body');
        body = value as Record<string, unknown>;
      } catch { return json({ error: 'Invalid extraction details.' }, 400); }
      if (source.status === 'ready') return json({ ready: true });
      if (body.action === 'fail' && typeof body.code === 'string' && Object.hasOwn(extractionErrors, body.code)) {
        await store.status(user.userId, id, 'failed', extractionErrors[body.code as ExtractionErrorCode]);
        return json({ failed: true });
      }
      if (!await files.head(source.object_key)) return json({ error: 'The original file is missing. Upload it again.' }, 409);
      if (body.action === 'start') { await store.status(user.userId, id, 'processing', null); return json({ started: true }); }
      const pages = validatePages(body.pages);
      if (body.action !== 'complete' || !pages) return json({ error: 'Send 1–100 ordered pages with readable text, up to 150,000 characters total.' }, 400);
      await store.save(user.userId, id, makePassages(pages));
      return json({ ready: true });
    } catch (error) {
      console.error('PDF extraction request failed', error);
      return json({ error: 'Document processing could not be saved. Please retry.' }, 500);
    }
  };
}
