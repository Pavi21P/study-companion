'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
export function CreateQuiz() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function create() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/quizzes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await response.json() as { quiz?: { id: string }; error?: string };
      if (!response.ok || !data.quiz?.id) throw new Error(data.error || 'Could not create quiz.');
      router.push(`/quizzes/${data.quiz.id}`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create quiz.'); setBusy(false); }
  }
  return <div><Button onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create quiz'}</Button>{error && <p className="error" role="alert">{error}</p>}</div>;
}
