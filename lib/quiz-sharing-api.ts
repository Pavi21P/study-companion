import { validShareToken, type sharingStore } from './quiz-sharing.ts';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } });
export function sharingApi(deps: { user: () => Promise<{ userId: string } | null>; store: () => ReturnType<typeof sharingStore> }) {
  return async (request: Request, quizId: string) => {
    const user = await deps.user();
    if (!user) return json({ error: 'Sign in to manage sharing.' }, 401);
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    if (request.method !== 'GET' && (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site')) return json({ error: 'Use Study Companion to manage sharing.' }, 403);
    try {
      const store = deps.store();
      if (request.method === 'GET') return json({ shares: await store.list(user.userId, quizId) });
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'Send JSON.' }, 415);
      const reader = request.body?.getReader(); if (!reader) return json({ error: 'Details required.' }, 400);
      let size = 0; let bodyText = ''; const decoder = new TextDecoder();
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1024) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); } bodyText += decoder.decode(value, { stream: true }); }
      bodyText += decoder.decode();
      let body: unknown; try { body = JSON.parse(bodyText); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1) return json({ error: 'Invalid sharing request.' }, 400);
      if (request.method === 'POST' && 'versionId' in body && typeof body.versionId === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(body.versionId)) {
        const share = await store.create(user.userId, quizId, body.versionId);
        return share ? json({ share }) : json({ error: 'Published quiz version not found.' }, 404);
      }
      if (request.method === 'DELETE' && 'token' in body && typeof body.token === 'string' && validShareToken(body.token)) {
        return await store.revoke(user.userId, quizId, body.token) ? json({ revoked: true }) : json({ error: 'Share link not found.' }, 404);
      }
      return json({ error: 'Invalid sharing request.' }, 400);
    } catch (error) { console.error('Sharing operation failed', error); return json({ error: 'Could not update sharing. Try again.' }, 500); }
  };
}
export function guestQuizApi(store: () => ReturnType<typeof sharingStore>) {
  return async (token: string) => {
    try { const quiz = await store().guest(token); return quiz ? json({ quiz }) : json({ error: 'This quiz link is unavailable.' }, 404); }
    catch { return json({ error: 'Could not load the quiz. Try again.' }, 503); }
  };
}
