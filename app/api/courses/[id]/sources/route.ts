import { env } from 'cloudflare:workers';
import { getStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { courseStore } from '@/lib/courses';
import { sourceStore } from '@/lib/sources';
import { sourceApi } from '@/lib/source-api';

export const dynamic = 'force-dynamic';
const handle = sourceApi({
  user: getStudyUser,
  courses: () => courseStore(getDb()),
  sources: () => sourceStore(getDb()),
  files: () => env.FILES,
});
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handle(request, (await context.params).id); }
export async function POST(request: Request, context: Context) { return handle(request, (await context.params).id); }
