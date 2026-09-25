import type { courseStore } from './courses';
import type { sourceStore } from './sources';
import { MAX_PDF_BYTES, pdfFilename, hasPdfEnvelope } from './pdf-upload.ts';

type Dependencies = {
  user: () => Promise<{ userId: string } | null>;
  courses: () => ReturnType<typeof courseStore>;
  sources: () => ReturnType<typeof sourceStore>;
  files: () => Pick<R2Bucket, 'put' | 'delete'> | undefined;
};
const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

export function sourceApi(deps: Dependencies) {
  return async (request: Request, courseId: string) => {
    const user = await deps.user();
    if (!user) return json({ error: 'Sign in to access course materials.' }, 401);
    if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (request.method === 'POST' && (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site')) {
      return json({ error: 'Upload from your Study Companion course page.' }, 403);
    }
    try {
      if (!await deps.courses().get(user.userId, courseId)) return json({ error: 'Course not found.' }, 404);
      const sources = deps.sources();
      if (request.method === 'GET') return json({ sources: await sources.list(user.userId, courseId) });
      const files = deps.files();
      if (!files) return json({ error: 'File uploads are unavailable. You can still create and share manual quizzes.' }, 503);
      const filename = pdfFilename(request.headers.get('x-file-name'));
      if (!filename || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/pdf') {
        return json({ error: 'Choose one PDF file with a filename of up to 200 characters.' }, 415);
      }
      if (Number(request.headers.get('content-length')) > MAX_PDF_BYTES) return json({ error: 'This PDF is larger than 10 MiB. Choose a smaller file.' }, 413);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'This file is empty. Choose a PDF with content.' }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PDF_BYTES) {
          await reader.cancel();
          return json({ error: 'This PDF is larger than 10 MiB. Choose a smaller file.' }, 413);
        }
        chunks.push(value);
      }
      if (!size) return json({ error: 'This file is empty. Choose a PDF with content.' }, 400);
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      if (!hasPdfEnvelope(bytes)) return json({ error: 'This file does not look like a complete PDF. Export it as a PDF and try again.' }, 422);
      const id = crypto.randomUUID();
      const key = `sources/${id}/original.pdf`;
      if (!await sources.create(user.userId, courseId, id, key, filename, size)) return json({ error: 'Course not found.' }, 404);

      try {
        const object = await files.put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
        if (!object) throw new Error('File storage did not confirm upload.');
        const source = await sources.finish(user.userId, id, null);
        if (!source) throw new Error('Source metadata could not be finalized.');
        return json({ source }, 201);
      } catch (error) {
        // D1 and R2 cannot share a transaction. Retain an explicit failure record.
        await Promise.allSettled([
          sources.finish(user.userId, id, 'Upload could not be completed. Please upload the file again.'),
          files.delete(key),
        ]);
        throw error;
      }
    } catch (error) {
      console.error('Source upload failed', error);
      return json({ error: 'The upload could not be completed. Please try again.' }, 500);
    }
  };
}
