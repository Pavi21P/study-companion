import { validShareToken } from './quiz-sharing.ts';
import type { folderSharingStore } from './folder-sharing.ts';
const validId = (value: string) => /^[a-zA-Z0-9-]{1,64}$/.test(value);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } });
export function guestFolderApi(store: () => ReturnType<typeof folderSharingStore>) {
  return async (request: Request, token: string, quizId?: string) => {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    if (!validShareToken(token)) return json({ error: 'Shared content unavailable.' }, 404);
    const params = new URL(request.url).searchParams;
    try {
      if (quizId !== undefined) {
        const version = params.get('version');
        if (!validId(quizId) || !version || !validId(version)) return json({ error: 'Shared content unavailable.' }, 404);
        const quiz = await store().guestQuiz(token, quizId, version);
        return quiz ? json({ quiz }) : json({ error: 'Shared content unavailable.' }, 404);
      }
      const folderId = params.get('folderId');
      if (folderId !== null && !validId(folderId)) return json({ error: 'Shared content unavailable.' }, 404);
      const folder = await store().browse(token, folderId);
      return folder ? json({ folder }) : json({ error: 'Shared content unavailable.' }, 404);
    } catch { return json({ error: 'Could not load shared content. Please try again.' }, 503); }
  };
}
export function folderSharingApi(deps: { user: () => Promise<{ userId: string } | null>; store: () => ReturnType<typeof folderSharingStore> }) {
  return async (request: Request, folderId: string) => {
    const user = await deps.user();
    if (!user) return json({ error: 'Sign in to manage sharing.' }, 401);
    if (!['GET', 'POST', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    if (request.method !== 'GET' && (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site')) return json({ error: 'Use Study Companion to manage sharing.' }, 403);
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(folderId)) return json({ error: 'Folder not found.' }, 404);
    try {
      const store = deps.store();
      if (request.method === 'GET') return json({ shares: await store.list(user.userId, folderId) });
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'Send JSON.' }, 415);
      const reader = request.body?.getReader(); if (!reader) return json({ error: 'Details required.' }, 400);
      let size = 0; let bodyText = ''; const decoder = new TextDecoder();
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1024) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); } bodyText += decoder.decode(value, { stream: true }); }
      bodyText += decoder.decode();
      let body: unknown; try { body = JSON.parse(bodyText); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid sharing request.' }, 400);
      if (request.method === 'POST' && Object.keys(body).length === 0) {
        const share = await store.create(user.userId, folderId);
        return share ? json({ share }) : json({ error: 'Folder not found.' }, 404);
      }
      if (request.method === 'DELETE' && Object.keys(body).length === 1 && 'token' in body && typeof body.token === 'string' && validShareToken(body.token)) {
        return await store.revoke(user.userId, folderId, body.token) ? json({ revoked: true }) : json({ error: 'Share link not found.' }, 404);
      }
      return json({ error: 'Invalid sharing request.' }, 400);
    } catch (error) { console.error('Sharing operation failed', error); return json({ error: 'Could not update sharing. Try again.' }, 500); }
  };
}
