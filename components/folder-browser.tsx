'use client';
import { clientResponse } from '@/lib/client-response';
import Link from '@/components/app-link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { QuizFolderPicker } from '@/components/quiz-folder-picker';
import type { QuizSummary } from '@/lib/manual-quizzes';
import type { Folder } from '@/lib/folders';

async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  const data = await clientResponse(response) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'Could not load folders.');
  return data as T;
}
const listing = (id: string | null) => `/api/folders${id ? `?parentId=${encodeURIComponent(id)}` : ''}`;
const location = (id: string | null) => id ? `/folders/${id}` : '/folders';

function MoveFolder({ folder, onClose, onMoved }: { folder: Folder; onClose: () => void; onMoved: () => void }) {
  const [retry, setRetry] = useState(0);
  const [parent, setParent] = useState<string | null>(null);
  const [current, setCurrent] = useState<Folder | null>(null);
  const [children, setChildren] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([read<{ folders: Folder[] }>(listing(parent), controller.signal), parent ? read<{ folder: Folder }>(`/api/folders/${parent}`, controller.signal) : Promise.resolve(null)])
      .then(([list, detail]) => { if (controller.signal.aborted) return; setChildren(list.folders); setCurrent(detail?.folder ?? null); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load destinations.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [parent, retry]);
  function changeParent(next: string | null) { setLoading(true); setError(''); setParent(next); }
  async function move() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/folders/${folder.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parentId: parent }) });
      if (!response.ok) throw new Error((await clientResponse(response) as { error?: string }).error || 'Could not move folder.');
      onMoved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not move folder.'); }
    finally { setBusy(false); }
  }
  return <section className="panel" aria-label={`Move ${folder.name}`}><h2>Move {folder.name}</h2><p>Destination: {current?.name ?? 'All folders'}</p>
    {error && <div role="alert"><p>{error}</p><Button variant="outline" disabled={busy || loading} onClick={() => { setLoading(true); setError(''); setRetry(n => n + 1); }}>Retry destinations</Button></div>}
    {loading ? <p>Loading destinations…</p> : <><div className="actions">{parent && <Button variant="outline" disabled={busy} onClick={() => changeParent(current?.parent_id ?? null)}>Up one level</Button>}{children.filter(child => child.id !== folder.id).map(child => <Button variant="outline" disabled={busy} key={child.id} onClick={() => changeParent(child.id)}>Open {child.name}</Button>)}</div>{!children.some(child => child.id !== folder.id) && <p>No subfolders here.</p>}</>}
    <div className="actions"><Button disabled={busy || loading || !!error || parent === folder.parent_id} onClick={move}>{busy ? 'Moving…' : 'Move here'}</Button><Button variant="outline" disabled={busy} onClick={onClose}>Cancel move</Button></div>
  </section>;
}

export function FolderBrowser({ id = null }: { id?: string | null }) {
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]); const [crumbs, setCrumbs] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [refresh, setRefresh] = useState(0); const [busy, setBusy] = useState(false);
  const [name, setName] = useState(''); const [editing, setEditing] = useState<Folder | null>(null); const [rename, setRename] = useState(''); const [moving, setMoving] = useState<Folder | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const list = await read<{ folders: Folder[]; quizzes: QuizSummary[] }>(listing(id), controller.signal);
        const path: Folder[] = []; const seen = new Set<string>(); let parent = id;
        while (parent) {
          if (seen.has(parent)) throw new Error('Could not load folder path.');
          seen.add(parent);
          const { folder } = await read<{ folder: Folder }>(`/api/folders/${parent}`, controller.signal);
          path.unshift(folder); parent = folder.parent_id;
        }
        if (!controller.signal.aborted) { setFolders(list.folders); setQuizzes(list.quizzes); setCrumbs(path); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load folders.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [id, refresh]);
  function reload() { setLoading(true); setError(''); setEditing(null); setMoving(null); setRefresh(n => n + 1); }
  async function save(event: React.SyntheticEvent<HTMLFormElement>, target?: Folder) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(target ? `/api/folders/${target.id}` : '/api/folders', { method: target ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(target ? { name: rename } : { name, parentId: id }) });
      if (!response.ok) throw new Error((await clientResponse(response) as { error?: string }).error || 'Could not save folder.');
      setName(''); setEditing(null); setNotice(target ? 'Folder renamed.' : 'Folder created.'); reload();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save folder.'); }
    finally { setBusy(false); }
  }
  return <div className="quiz-editor"><nav className="actions" aria-label="Folder path"><Link className="text-link" href="/folders">All folders</Link>{crumbs.map((folder, index) => <span key={folder.id}> / <Link className="text-link" href={location(folder.id)} aria-current={index === crumbs.length - 1 ? 'page' : undefined}>{folder.name}</Link></span>)}</nav>
    <h1>{crumbs.at(-1)?.name ?? 'Your folders'}</h1>
    {notice && <output>{notice}</output>}{error && <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => reload()}>Reload folders</Button></div>}
    {loading ? <p>Loading folders…</p> : <><section className="panel"><h2>{id ? 'Create a subfolder' : 'Create a folder'}</h2><form className="course-form" onSubmit={event => save(event)}><label htmlFor="folder-name">Folder name</label><Input id="folder-name" required maxLength={120} value={name} onChange={event => setName(event.target.value)} disabled={busy}/><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Create folder'}</Button></form></section>
      {moving && <MoveFolder key={moving.id} folder={moving} onClose={() => setMoving(null)} onMoved={() => { setNotice('Folder moved.'); reload(); }}/>}
      <section aria-label="Folder quizzes"><h2>{id ? 'Quizzes in this folder' : 'Unfiled quizzes'}</h2>{!quizzes.length && <p>No quizzes here yet. Open a quiz and choose Move quiz to folder to organize it.</p>}{quizzes.map(quiz => <div className="panel" key={quiz.id}><h3><Link className="text-link" href={`/quizzes/${quiz.id}`}>{quiz.title}</Link></h3><p>{quiz.question_count} questions</p><QuizFolderPicker quizId={quiz.id} onMoved={reload}/></div>)}</section><section aria-label="Subfolders">{!folders.length && <p className="panel">No folders here yet.</p>}{folders.map(folder => <div className="panel" key={folder.id}><h2><Link className="text-link" href={location(folder.id)}>{folder.name}</Link></h2>{editing?.id === folder.id ? <form className="course-form" onSubmit={event => save(event, folder)}><label htmlFor="rename-folder">New folder name</label><Input id="rename-folder" required maxLength={120} value={rename} onChange={event => setRename(event.target.value)} disabled={busy}/><div className="actions"><Button type="submit" disabled={busy || !rename.trim()}>Save name</Button><Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancel rename</Button></div></form> : <div className="actions"><Button variant="outline" disabled={busy} onClick={() => { setEditing(folder); setRename(folder.name); setMoving(null); }}>Rename {folder.name}</Button><Button variant="outline" disabled={busy} onClick={() => { setMoving(folder); setEditing(null); }}>Move {folder.name}</Button></div>}</div>)}</section></>}
  </div>;
}
