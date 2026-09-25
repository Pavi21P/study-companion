'use client';
import { clientResponse } from '@/lib/client-response';
import { useSyncExternalStore, useState } from 'react';
import Link from '@/components/app-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { QuizShare } from '@/lib/quiz-sharing';
const subscribeOrigin = () => () => {};
export function QuizSharing({ quizId, versionId, initialShares }: { quizId: string; versionId: string; initialShares: QuizShare[] }) {
  const [shares, setShares] = useState(initialShares); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const origin = useSyncExternalStore(subscribeOrigin, () => window.location.origin, () => '');

  const active = shares.find(s => s.version_id === versionId && s.revoked_at === null);
  async function update(method: 'POST' | 'DELETE') {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch(`/api/quizzes/${quizId}/shares`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(method === 'POST' ? { versionId } : { token: active?.id }) });
      const data = await clientResponse(response) as { share?: QuizShare; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not update sharing.');
      if (method === 'POST' && data.share) { const share = data.share; setShares(current => [...current.filter(s => s.id !== share.id), share]); setMessage('Sharing enabled for this published version.'); }
      else { setShares(current => current.map(s => s.id === active?.id ? { ...s, revoked_at: Math.floor(Date.now() / 1000) } : s)); setMessage('Link revoked. Opening it again will show that the quiz is unavailable.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update sharing.'); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!active) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}/shared/${active.id}`); setMessage('Link copied.'); }
    catch { setError('Could not copy automatically. Select the link below and copy it.'); }
  }
  return <section className="panel editor-section" aria-labelledby="share-heading"><h2 id="share-heading">Share this version</h2><p>Anyone with an active link can open the prebuilt quiz without signing in. Later draft edits do not change this version.</p>
    <p>Visitors can answer the quiz and submit it for a score and explanations.</p>
    {active ? <><label htmlFor="share-link">Share link</label><Input id="share-link" readOnly value={`${origin}/shared/${active.id}`} onFocus={e => e.target.select()}/><div className="actions"><Button type="button" onClick={copy}>Copy link</Button><Link className="text-link" href={`/shared/${active.id}`} target="_blank" rel="noreferrer">Open shared quiz</Link><Button type="button" variant="outline" disabled={busy} onClick={() => update('DELETE')}>Revoke link</Button></div></> : <><p>Sharing is off for this version.</p><Button type="button" disabled={busy} onClick={() => update('POST')}>{busy ? 'Creating link…' : 'Create share link'}</Button></>}
    <output aria-live="polite">{message}</output>{error && <p role="alert" className="error">{error}</p>}
  </section>;
}
