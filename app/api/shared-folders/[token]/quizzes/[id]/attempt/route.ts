import { getDb } from '@/db';
import { folderGuestAttemptStore } from '@/lib/folder-guest-attempts';
import { guestAttemptApi } from '@/lib/guest-attempt-api';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ token: string; id: string }> };
async function handle(request: Request, context: Context) {
  const { token, id } = await context.params;
  const version = new URL(request.url).searchParams.get('version');
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(id) || !version || !/^[a-zA-Z0-9-]{1,64}$/.test(version)) {
    return Response.json({ error: 'Attempt unavailable.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } });
  }
  return guestAttemptApi(() => folderGuestAttemptStore(getDb(), id, version))(request, token);
}
export const GET = handle;
export const POST = handle;
