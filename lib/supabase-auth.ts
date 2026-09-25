import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { identityMode } from './auth-policy';

export function authMode() { return identityMode(env.STUDY_AUTH_PROVIDER); }

export function supabaseConfig() {
  if (authMode() !== 'supabase' || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.STUDY_SITE_URL) return null;
  try {
    const url = new URL(env.SUPABASE_URL);
    const site = new URL(env.STUDY_SITE_URL);
    const local = ['localhost', '127.0.0.1'].includes(site.hostname);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if ((site.protocol !== 'https:' && !(local && site.protocol === 'http:')) || site.username || site.password || site.pathname !== '/' || site.search || site.hash) return null;
    return { url: url.origin, key: env.SUPABASE_PUBLISHABLE_KEY, origin: site.origin, secure: site.protocol === 'https:' };
  } catch { return null; }
}

export type AuthCookie = { name: string; value: string; options: CookieOptions };
export function makeAuthClient(config: NonNullable<ReturnType<typeof supabaseConfig>>, getAll: () => { name: string; value: string }[], setAll: (cookies: AuthCookie[]) => void) {
  return createServerClient(config.url, config.key, {
    cookieOptions: { path: '/', sameSite: 'lax', secure: config.secure, httpOnly: true },
    cookies: { getAll, setAll },
  });
}

export async function serverAuthClient(writable = false) {
  const config = supabaseConfig();
  if (!config) return null;
  const jar = await cookies();
  return makeAuthClient(config, () => jar.getAll(), changes => {
    // Middleware refreshes sessions before read-only Server Components run.
    if (writable) for (const { name, value, options } of changes) jar.set(name, value, options);
  });
}
