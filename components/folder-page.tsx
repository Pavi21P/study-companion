import Link from '@/components/app-link';
import { getStudyUser, signInPath, signInLabel } from '@/lib/identity';
import { FolderBrowser } from '@/components/folder-browser';
import { Button } from '@/components/ui/button';
import { getDb } from '@/db';
import { folderSharingStore } from '@/lib/folder-sharing';
import { folderStore } from '@/lib/folders';
import { FolderSharing } from '@/components/folder-sharing';
export async function FolderPage({ id }: { id?: string }) {
  const user = await getStudyUser();
  if (!user) return <section className="panel"><h1>Your folders</h1><p>Sign in to create folders and organize your study space.</p><Button nativeButton={false} render={<a aria-label={signInLabel} href={signInPath(id ? `/folders/${id}` : '/folders')}/>}>{signInLabel}</Button></section>;
  if (id && !await folderStore(getDb()).get(user.userId, id)) return <section className="panel"><h1>Folder unavailable</h1><p>This folder was not found.</p><Link className="text-link" href="/folders">All folders</Link></section>;
  const shares = id ? await folderSharingStore(getDb()).list(user.userId, id) : [];
  return <><FolderBrowser key={id ?? 'root'} id={id}/>{id && <FolderSharing key={id} folderId={id} initialShares={shares}/>}</>;
}
