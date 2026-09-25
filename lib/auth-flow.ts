import { safeAuthReturn } from './auth-policy.ts';

type Client = { auth: {
  signInWithOAuth: (input: { provider: 'google'; options: { redirectTo: string; skipBrowserRedirect: boolean } }) => Promise<{ data: { url: string | null }; error: unknown }>;
  exchangeCodeForSession: (code: string) => Promise<{ error: unknown }>;
  signOut: (options: { scope: 'local' }) => Promise<{ error: unknown }>;
} };
type Dependencies = {
  config: () => { origin: string; url: string } | null;
  client: () => Promise<Client | null>;
};
const response = (message: string, status: number) => new Response(status === 204 ? null : message, { status, headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'text/plain; charset=utf-8', 'Referrer-Policy': 'no-referrer' } });
const go = (url: string) => new Response(null, { status: 303, headers: { Location: url, 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } });

export function authFlow(deps: Dependencies) {
  return async (request: Request, action: 'sign-in' | 'callback' | 'logout') => {
    const config = deps.config();
    if (!config) return response('Sign-in is not configured yet. Shared quizzes do not require sign-in.', 503);
    const url = new URL(request.url);
    if (url.origin !== config.origin) return response('Use the configured Study Companion address.', 403);
    if (request.method !== (action === 'logout' ? 'POST' : 'GET')) return response('Method not allowed.', 405);
    if (action === 'logout' && (request.headers.get('origin') !== config.origin || request.headers.get('sec-fetch-site') === 'cross-site')) return response('Sign out from your Study Companion page.', 403);
    if (action === 'sign-in' && (request.headers.has('next-router-prefetch') || /prefetch/i.test(request.headers.get('purpose') ?? '') || /prefetch/i.test(request.headers.get('sec-purpose') ?? ''))) return response('', 204);
    try {
      const client = await deps.client();
      if (!client) return response('Sign-in is unavailable. Please try again later.', 503);
      if (action === 'sign-in') {
        const callback = new URL('/auth/callback', config.origin);
        callback.searchParams.set('return_to', safeAuthReturn(url.searchParams.get('return_to')));
        const { data, error } = await client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback.href, skipBrowserRedirect: true } });
        if (!error && data.url) {
          const destination = new URL(data.url);
          if (destination.origin === new URL(config.url).origin && destination.pathname === '/auth/v1/authorize') return go(destination.href);
        }
      } else if (action === 'callback') {
        const code = url.searchParams.get('code');
        if (!url.searchParams.has('error') && code && code.length <= 4096) {
          const { error } = await client.auth.exchangeCodeForSession(code);
          if (!error) return go(new URL(safeAuthReturn(url.searchParams.get('return_to')), config.origin).href);
        }
      } else {
        const { error } = await client.auth.signOut({ scope: 'local' });
        if (!error) return go(config.origin + '/');
      }
    } catch { /* Never expose provider errors, callback codes, or session tokens. */ }
    return go(config.origin + '/auth/error');
  };
}
