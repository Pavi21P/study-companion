import { folderName, type folderStore } from './folders.ts';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
const validId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9-]{1,64}$/.test(value);
export function folderApi(deps: { user: () => Promise<{ userId: string } | null>; store: () => ReturnType<typeof folderStore> }) {
  return async (request: Request, id?: string) => {
    const user = await deps.user();
    if (!user) return json({ error: 'Sign in to manage folders.' }, 401);
    if (!(id === undefined ? ['GET', 'POST'] : ['GET', 'PATCH']).includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    if (id !== undefined && !validId(id)) return json({ error: 'Folder not found.' }, 404);
    const url = new URL(request.url);
    if (request.method !== 'GET' && (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site')) return json({ error: 'Use Study Companion to manage folders.' }, 403);
    try {
      const store = deps.store();
      if (request.method === 'GET') {
        if (id !== undefined) {
          const folder = await store.get(user.userId, id);
          return folder ? json({ folder }) : json({ error: 'Folder not found.' }, 404);
        }
        const parent = url.searchParams.get('parentId');
        if (parent !== null && !validId(parent)) return json({ error: 'Invalid parent folder.' }, 400);
        if (parent !== null && !await store.get(user.userId, parent)) return json({ error: 'Folder not found.' }, 404);
        return json({ folders: await store.list(user.userId, parent), quizzes: await store.quizzes(user.userId, parent) });
      }
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'Send JSON.' }, 415);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: 'Folder details required.' }, 400);
      let size = 0; let bodyText = ''; const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2048) { await reader.cancel(); return json({ error: 'Request too large.' }, 413); }
        bodyText += decoder.decode(value, { stream: true });
      }
      bodyText += decoder.decode();
      let body: unknown;
      try { body = JSON.parse(bodyText); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid folder request.' }, 400);
      const keys = Object.keys(body);
      if (id === undefined) {
        if (keys.some(key => !['name', 'parentId'].includes(key)) || !('name' in body) || !folderName(body.name)) return json({ error: 'Provide a folder name of 1–120 characters.' }, 400);
        const parent = 'parentId' in body ? body.parentId : null;
        if (parent !== null && !validId(parent)) return json({ error: 'Invalid parent folder.' }, 400);
        const folder = await store.create(user.userId, body.name as string, parent);
        return folder ? json({ folder }, 201) : json({ error: 'Parent folder not found.' }, 404);
      }
      // One operation per PATCH avoids partially applying a rename and move.
      if (keys.length !== 1) return json({ error: 'Rename or move one folder at a time.' }, 400);
      if ('name' in body && folderName(body.name)) {
        const folder = await store.rename(user.userId, id, body.name as string);
        return folder ? json({ folder }) : json({ error: 'Folder not found.' }, 404);
      }
      if ('parentId' in body && (body.parentId === null || validId(body.parentId))) {
        if (!await store.get(user.userId, id)) return json({ error: 'Folder not found.' }, 404);
        const folder = await store.move(user.userId, id, body.parentId);
        return folder ? json({ folder }) : json({ error: 'Cannot move there. Choose an available folder outside this folder and its subfolders.' }, 409);
      }
      return json({ error: 'Provide a valid name or parent folder.' }, 400);
    } catch { return json({ error: 'Could not update folders. Please try again.' }, 503); }
  };
}
