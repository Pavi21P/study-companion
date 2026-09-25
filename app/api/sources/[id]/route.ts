import { env } from 'cloudflare:workers';
import { getStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { extractionStore } from '@/lib/extraction-store';
import { extractionApi } from '@/lib/extraction-api';
export const dynamic = 'force-dynamic';
const handle = extractionApi({ user: getStudyUser, store: () => extractionStore(getDb()), files: () => env.FILES });
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handle(request, (await context.params).id); }
export async function POST(request: Request, context: Context) { return handle(request, (await context.params).id); }
