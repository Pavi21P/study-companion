import { getDb } from '@/db';
import { folderSharingStore } from '@/lib/folder-sharing';
import { guestFolderApi } from '@/lib/folder-sharing-api';
export const dynamic = 'force-dynamic';
const handle = guestFolderApi(() => folderSharingStore(getDb()));
export async function GET(request: Request, context: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await context.params; return handle(request, token, id);
}
