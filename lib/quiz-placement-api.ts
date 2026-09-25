import type { quizPlacementStore } from './quiz-placement.ts';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
export function quizPlacementApi(deps: { user: () => Promise<{ userId: string } | null>; store: () => ReturnType<typeof quizPlacementStore> }) {
  return async (request: Request, id: string) => {
    const user = await deps.user();
    if (!user) return json({ error: 'Sign in to organize quizzes.' }, 401);
    if (!['GET', 'PATCH'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    if (!validId(id)) return json({ error: 'Quiz not found.' }, 404);
    if (request.method === 'PATCH' && (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site')) return json({ error: 'Use Study Companion to move quizzes.' }, 403);
    try {
      const store = deps.store();
      if (request.method === 'GET') {
        const placement = await store.get(user.userId, id);
        return placement ? json({ placement }) : json({ error: 'Quiz not found.' }, 404);
      }
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'Send JSON.' }, 415);
      const reader = request.body?.getReader(); if (!reader) return json({ error: 'Folder required.' }, 400);
      let size = 0; let input = ''; const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 1024) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); }
        input += decoder.decode(value, { stream: true });
      }
      input += decoder.decode();
      let body: unknown; try { body = JSON.parse(input); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('folderId' in body) || (body.folderId !== null && !validId(body.folderId))) return json({ error: 'Provide a folderId or null for unfiled quizzes.' }, 400);
      return await store.move(user.userId, id, body.folderId) ? json({ moved: true }) : json({ error: 'Quiz or destination folder not found.' }, 404);
    } catch { return json({ error: 'Could not move quiz. Please try again.' }, 503); }
  };
}
