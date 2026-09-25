import { getStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { sharingStore } from '@/lib/quiz-sharing';
import { sharingApi } from '@/lib/quiz-sharing-api';
export const dynamic = 'force-dynamic';
const handle = sharingApi({ user: getStudyUser, store: () => sharingStore(getDb()) });
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handle(request, (await context.params).id); }
export async function POST(request: Request, context: Context) { return handle(request, (await context.params).id); }
export async function DELETE(request: Request, context: Context) { return handle(request, (await context.params).id); }
