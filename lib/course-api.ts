import type { CourseInput, courseStore } from './courses';

type Dependencies = {
  user: () => Promise<{ userId: string } | null>;
  store: () => ReturnType<typeof courseStore>;
  parse: (value: unknown) => CourseInput | null;
};
const json = (value: unknown, status = 200) => Response.json(value, {
  status, headers: { 'Cache-Control': 'private, no-store' },
});

export function courseApi({ user, store, parse }: Dependencies) {
  return async (request: Request, id?: string) => {
    const identity = await user();
    if (!identity) return json({ error: 'Sign in to access your courses.' }, 401);
    const write = request.method === 'POST' || request.method === 'PATCH';
    if (write) {
      if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
        return json({ error: 'This request must come from Study Companion.' }, 403);
      }
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
        return json({ error: 'Send course details as JSON.' }, 415);
      }
    }
    try {
      const courses = store();
      if (request.method === 'GET') {
        if (!id) return json({ courses: await courses.list(identity.userId) });
        const course = await courses.get(identity.userId, id);
        return course ? json({ course }) : json({ error: 'Course not found.' }, 404);
      }
      if (!write) return json({ error: 'Method not allowed.' }, 405);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Course details are required.' }, 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8192) {
          await reader.cancel();
          return json({ error: 'Course details are too large.' }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let body: unknown;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); }
      catch { return json({ error: 'Course details contain invalid JSON.' }, 400); }
      const input = parse(body);
      if (!input) return json({ error: 'Use a title of 1–120 characters and a description of up to 1,000 characters.' }, 400);
      if (request.method === 'POST' && !id) {
        return json({ course: await courses.create(identity.userId, input) }, 201);
      }
      if (request.method === 'PATCH' && id) {
        const course = await courses.update(identity.userId, id, input);
        return course ? json({ course }) : json({ error: 'Course not found.' }, 404);
      }
      return json({ error: 'Method not allowed.' }, 405);
    } catch (error) {
      console.error('Course operation failed', error);
      return json({ error: 'Your courses could not be saved or loaded. Please try again.' }, 500);
    }
  };
}
