'use client';
import Link from '@/components/app-link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SharedFolder as FolderData } from '@/lib/folder-sharing';
export function SharedFolder({ token, folderId }: { token: string; folderId: string | null }) {
  const [folder, setFolder] = useState<FolderData | null>(null);
  const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/shared-folders/${encodeURIComponent(token)}${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''}`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json().catch(() => ({ error: 'Could not load this folder. Please try again.' })) as { folder?: FolderData; error?: string };
        if (!response.ok || !data.folder) throw new Error(data.error || 'Shared folder unavailable.');
        if (!controller.signal.aborted) setFolder(data.folder);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load this folder.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [token, folderId, retry]);
  if (loading) return <p className="panel">Loading shared folder…</p>;
  if (error || !folder) return <section className="panel"><h1>Shared folder unavailable</h1><p role="alert">{error}</p><Button onClick={() => { setLoading(true); setError(''); setRetry(n => n + 1); }}>Try again</Button></section>;
  return <div className="quiz-editor"><nav className="actions" aria-label="Shared folder path"><Link className="text-link" href={`/shared-folders/${token}`}>Shared folder</Link>{folderId && <span aria-current="page"> / {folder.name}</span>}</nav><h1>{folder.name}</h1>
    <section aria-label="Shared subfolders"><h2>Folders</h2>{folder.folders.length ? <div className="course-grid">{folder.folders.map(child => <Link className="panel text-link" key={child.id} href={`/shared-folders/${token}?folderId=${child.id}`}>{child.name}</Link>)}</div> : <p>No subfolders here.</p>}</section>
    <section aria-label="Published quizzes"><h2>Quizzes</h2>{folder.quizzes.length ? folder.quizzes.map(quiz => <section className="panel" key={quiz.id}><h3><Link className="text-link" href={`/shared-folders/${token}/quizzes/${quiz.id}?version=${quiz.versionId}`}>{quiz.title}</Link></h3>{quiz.description && <p>{quiz.description}</p>}</section>) : <p>No published quizzes here yet.</p>}</section>
  </div>;
}
