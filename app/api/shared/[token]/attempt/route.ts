import { getDb } from '@/db';
import { guestAttemptStore } from '@/lib/guest-attempts';
import { guestAttemptApi } from '@/lib/guest-attempt-api';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ token: string }> };
const handle = guestAttemptApi(() => guestAttemptStore(getDb()));
export async function GET(request: Request, context: Context) { return handle(request, (await context.params).token); }
export async function POST(request: Request, context: Context) { return handle(request, (await context.params).token); }
