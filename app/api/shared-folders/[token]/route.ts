import { getDb } from '@/db';
import { folderSharingStore } from '@/lib/folder-sharing';
import { guestFolderApi } from '@/lib/folder-sharing-api';
export const dynamic = 'force-dynamic';
const handle = guestFolderApi(() => folderSharingStore(getDb()));
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) { return handle(request, (await context.params).token); }
