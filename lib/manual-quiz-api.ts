import { parseDraft, type manualQuizStore } from './manual-quizzes.ts';
import { MAX_QUIZ_SNAPSHOT_BYTES } from './manual-quiz-limits.ts';
import { publicationIssues } from './quiz-publication.ts';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export function manualQuizApi(deps: { user: () => Promise<{ userId: string } | null>; store: () => ReturnType<typeof manualQuizStore> }) {
  return async (request: Request, id?: string) => {
    const user = await deps.user();
    if (!user) return json({ error: 'Sign in to access your quizzes.' }, 401);
    if (!['GET', 'POST', 'PUT'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    if (request.method !== 'GET') {
      if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return json({ error: 'This request must come from Study Companion.' }, 403);
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'Send quiz details as JSON.' }, 415);
    }
    try {
      const store = deps.store();
      if (request.method === 'GET') {
        if (!id) return json({ quizzes: await store.list(user.userId) });
        const quiz = await store.get(user.userId, id);
        return quiz ? json({ quiz }) : json({ error: 'Quiz not found.' }, 404);
      }
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Quiz details are required.' }, 400);
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > MAX_QUIZ_SNAPSHOT_BYTES + 20_000) { await reader.cancel(); return json({ error: 'Quiz is too large. Shorten the question text and try again.' }, 413); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let body: unknown;
      try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { return json({ error: 'Invalid quiz JSON.' }, 400); }
      if (request.method === 'POST' && !id) {
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length) return json({ error: 'Create a blank quiz with an empty object.' }, 400);
        return json({ quiz: await store.create(user.userId) }, 201);
      }
      if (request.method === 'POST' && id) {
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('revision' in body) || !Number.isSafeInteger(body.revision) || (body.revision as number) < 1) return json({ error: 'Send the saved draft revision.' }, 400);
        const quiz = await store.get(user.userId, id);
        if (!quiz) return json({ error: 'Quiz not found.' }, 404);
        if (quiz.revision !== body.revision) return json({ error: 'The draft changed. Reload the preview before publishing.' }, 409);
        const draft = { title: quiz.title, description: quiz.description, revision: quiz.revision, questions: quiz.questions };
        const issues = publicationIssues(draft);
        if (issues.length) return json({ error: 'Finish these items before publishing.', issues }, 422);
        const version = await store.publish(user.userId, id, draft);
        return version ? json({ version }) : json({ error: 'The draft changed. Reload the preview before publishing.' }, 409);
      }
      if (request.method !== 'PUT' || !id) return json({ error: 'Method not allowed.' }, 405);
      const input = parseDraft(body);
      if (!input) return json({ error: 'Check the title, question limits and answer choices. Drafts support 500 questions and 1 MB of question content.' }, 400);
      const result = await store.save(user.userId, id, input);
      if (result === 'missing') return json({ error: 'Quiz not found.' }, 404);
      if (result === 'conflict') return json({ error: 'This quiz was changed in another tab. Your edits are still here. Reload the saved draft before trying again.' }, 409);
      if (result === 'invalid-ids') return json({ error: 'A question ID is already in use. Create the question again.' }, 400);
      return json({ revision: input.revision + 1 });
    } catch (error) {
      console.error('Manual quiz operation failed', error);
      return json({ error: 'The quiz could not be saved or loaded. Your edits are still here; please try again.' }, 500);
    }
  };
}
