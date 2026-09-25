import { NextResponse, type NextRequest } from 'next/server';
import { authMode, makeAuthClient, supabaseConfig, type AuthCookie } from '@/lib/supabase-auth';

export async function middleware(request: NextRequest) {
  if (authMode() === 'sites') return NextResponse.next();
  // Never forward caller-supplied Sites identity on a standalone deployment.
  const headers = new Headers(request.headers);
  const untrusted = Array.from(headers.keys()).filter(name => name.startsWith('oai-authenticated-user-'));
  for (const name of untrusted) headers.delete(name);
  const changed: AuthCookie[] = [];
  const config = supabaseConfig();
  if (config && !request.nextUrl.pathname.startsWith('/auth/')) {
    const client = makeAuthClient(config, () => request.cookies.getAll(), updates => {
      for (const update of updates) { request.cookies.set(update.name, update.value); changed.push(update); }
    });
    try { await client.auth.getUser(); } catch { /* Downstream identity verification fails closed. */ }
  }
  headers.set('cookie', request.cookies.toString());
  const response = NextResponse.next({ request: { headers } });
  for (const { name, value, options } of changed) response.cookies.set(name, value, options);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
export const config = { matcher: ['/', '/quizzes/:path*', '/folders/:path*', '/courses/:path*', '/sources/:path*', '/auth/:path*', '/api/quizzes/:path*', '/api/folders/:path*', '/api/courses/:path*', '/api/sources/:path*'] };
