import { attemptHash, parseGuestAnswers, type guestAttemptStore } from './guest-attempts.ts';
import { validShareToken } from './quiz-sharing.ts';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } });
export function guestAttemptApi(store: () => ReturnType<typeof guestAttemptStore>) {
  return async (request: Request, share: string) => {
    if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405);
    const key = request.headers.get('x-attempt-key');
    if (!validShareToken(share) || !key || !validShareToken(key)) return json({ error: 'Attempt unavailable.' }, 404);
    if (request.method === 'POST' && (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site')) return json({ error: 'Submit answers from the quiz page.' }, 403);
    try {
      const hash = await attemptHash(key); const attempts = store();
      if (request.method === 'GET') { const result = await attempts.get(share, hash); return result ? json({ result }) : json({ error: 'Attempt unavailable.' }, 404); }
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'Send answers as JSON.' }, 415);
      const reader = request.body?.getReader(); if (!reader) return json({ error: 'Answers required.' }, 400);
      let size = 0; let text = ''; const decoder = new TextDecoder();
      while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 128_000) { await reader.cancel(); return json({ error: 'Answers are too large.' }, 413); } text += decoder.decode(value, { stream: true }); }
      text += decoder.decode(); let body: unknown;
      try { body = JSON.parse(text); } catch { return json({ error: 'Invalid JSON.' }, 400); }
      const answers = parseGuestAnswers(body); if (!answers) return json({ error: 'Send one valid answer for each question.' }, 400);
      const outcome = await attempts.submit(share, hash, answers);
      if ('error' in outcome) return outcome.error === 'invalid' ? json({ error: 'Answer every question using its available choices.' }, 400) : json({ error: 'This quiz or attempt is unavailable.' }, 404);
      return json(outcome);
    } catch { return json({ error: 'Could not save your result. Retry with your answers still here.' }, 503); }
  };
}
