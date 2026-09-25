import { getStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { folderStore } from '@/lib/folders';
import { folderApi } from '@/lib/folder-api';
export const dynamic = 'force-dynamic';
const handle = folderApi({ user: getStudyUser, store: () => folderStore(getDb()) });
export async function GET(request: Request) { return handle(request); }
export async function POST(request: Request) { return handle(request); }
