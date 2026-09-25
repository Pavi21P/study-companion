'use client';
import { clientResponse } from '@/lib/client-response';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Folder } from '@/lib/folders';

export function QuizFolderPicker({ quizId, onMoved }: { quizId: string; onMoved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [parent, setParent] = useState<string | null>(null);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [children, setChildren] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/folders${parent ? `?parentId=${encodeURIComponent(parent)}` : ''}`, { signal: controller.signal, cache: 'no-store' });
        const list = await clientResponse(response) as { folders: Folder[]; error?: string };
        if (!response.ok) throw new Error(list.error || 'Could not load folders.');
        let current: Folder | null = null;
        if (parent) {
          const detail = await fetch(`/api/folders/${parent}`, { signal: controller.signal, cache: 'no-store' });
          const data = await clientResponse(detail) as { folder: Folder; error?: string };
          if (!detail.ok) throw new Error(data.error || 'Folder unavailable.');
          current = data.folder;
        }
        if (!controller.signal.aborted) { setChildren(list.folders); setFolder(current); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load folders.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [open, parent, retry]);
  function browse(id: string | null) { setLoading(true); setError(''); setParent(id); setRetry(n => n + 1); }
  async function move() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/quizzes/${quizId}/folder`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folderId: parent }) });
      if (!response.ok) throw new Error((await clientResponse(response) as { error?: string }).error || 'Could not move quiz.');
      setNotice(parent ? `Quiz moved to ${folder?.name}.` : 'Quiz moved to Unfiled quizzes.'); setOpen(false); onMoved?.();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not move quiz.'); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-label="Quiz folder"><h2>Organize quiz</h2>{notice && <output>{notice}</output>}
    {!open ? <Button type="button" variant="outline" onClick={() => { browse(null); setNotice(''); setOpen(true); }}>Move quiz to folder</Button> : <>
      <p>Destination: {loading ? 'Loading…' : folder?.name ?? 'Unfiled quizzes'}</p>
      {error && <div role="alert"><p>{error}</p><Button type="button" variant="outline" disabled={busy || loading} onClick={() => browse(parent)}>Retry folders</Button></div>}
      {!loading && !error && <div className="actions">{parent && <Button type="button" variant="outline" disabled={busy} onClick={() => browse(folder?.parent_id ?? null)}>Up one level</Button>}{children.map(child => <Button type="button" variant="outline" disabled={busy} key={child.id} onClick={() => browse(child.id)}>Open {child.name}</Button>)}</div>}
      <div className="actions"><Button type="button" disabled={busy || loading || !!error} onClick={move}>{busy ? 'Moving…' : 'Move quiz here'}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel quiz move</Button></div>
    </>}
  </section>;
}
