import { getStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { folderSharingStore } from '@/lib/folder-sharing';
import { folderSharingApi } from '@/lib/folder-sharing-api';
export const dynamic = 'force-dynamic';
const handle = folderSharingApi({ user: getStudyUser, store: () => folderSharingStore(getDb()) });
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) { return handle(request, (await context.params).id); }
export async function POST(request: Request, context: Context) { return handle(request, (await context.params).id); }
export async function DELETE(request: Request, context: Context) { return handle(request, (await context.params).id); }
