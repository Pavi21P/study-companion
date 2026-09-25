import { getStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { folderStore } from '@/lib/folders';
import { folderApi } from '@/lib/folder-api';
export const dynamic = 'force-dynamic';
const handle = folderApi({ user: getStudyUser, store: () => folderStore(getDb()) });
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handle(request, (await context.params).id); }
export async function PATCH(request: Request, context: Context) { return handle(request, (await context.params).id); }
