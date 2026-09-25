'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { DraftQuestion } from '@/lib/manual-quizzes';

export function QuizPreview({ id, revision, questions, issues, published = false }: { id: string; revision: number; questions: DraftQuestion[]; issues: string[]; published?: boolean }) {
  const router = useRouter(); const [selected, setSelected] = useState(0); const [answer, setAnswer] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [serverIssues, setServerIssues] = useState<string[]>([]); const question = questions[selected];
  function navigate(index: number) { setSelected(index); setAnswer(null); setReveal(false); }
  async function publish() {
    setBusy(true); setError(''); setServerIssues([]);
    try {
      const response = await fetch(`/api/quizzes/${id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision }) });
      const data = await response.json() as { error?: string; issues?: string[]; version?: { id: string } };
      if (!response.ok || !data.version) { setServerIssues(data.issues ?? []); throw new Error(data.error || 'Could not publish.'); }
      router.push(`/quizzes/${id}/preview?version=${data.version.id}`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not publish.'); }
    finally { setBusy(false); }
  }
  return <div className="quiz-editor">
    <section className="panel editor-section"><h2>{published ? 'Published version' : 'Review before publishing'}</h2><p>{published ? 'This version stays unchanged when you edit the draft. Manage its share link below.' : 'Preview uses your saved draft. Publishing saves a fixed version; it does not make this quiz public yet.'}</p>
      {!!issues.length && <div><h3>Items to finish</h3><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
      {!published && <Button type="button" disabled={busy || issues.length > 0} onClick={publish}>{busy ? 'Publishing…' : 'Publish saved draft'}</Button>}
      {error && <p className="error" role="alert">{error}</p>}{!!serverIssues.length && <ul>{serverIssues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
      {error && <Button type="button" variant="outline" onClick={() => window.location.reload()}>Reload preview</Button>}
    </section>
    {question && <section className="panel editor-section" aria-labelledby="preview-question"><label htmlFor="preview-jump">Question</label><select id="preview-jump" className="question-select" value={selected} onChange={e => navigate(Number(e.target.value))}>{questions.map((q, i) => <option key={q.id} value={i}>Question {i + 1} of {questions.length}</option>)}</select>
      <h2 id="preview-question">{question.prompt || 'Unfinished question'}</h2>
      <fieldset className="editor-choices"><legend>Choose an answer</legend>{question.choices.map((choice, i) => <label className="preview-choice" key={i}><input type="radio" name="preview-answer" checked={answer === i} onChange={() => { setAnswer(i); setReveal(false); }}/><span>{choice || `Unfinished choice ${i + 1}`}</span></label>)}</fieldset>
      <Button type="button" variant="outline" onClick={() => setReveal(!reveal)}>{reveal ? 'Hide answer' : 'Show answer'}</Button>
      {reveal && <div className="panel"><strong>{question.correctIndex === null ? 'No correct answer selected yet.' : `Correct answer: Choice ${question.correctIndex + 1} — ${question.choices[question.correctIndex]}`}</strong>{answer !== null && question.correctIndex !== null && <p>{answer === question.correctIndex ? 'Your answer is correct.' : 'Your answer is incorrect.'}</p>}{question.explanation && <p className="passage-text">{question.explanation}</p>}</div>}
      <div className="actions"><Button type="button" variant="outline" disabled={selected === 0} onClick={() => navigate(selected - 1)}>Previous</Button><Button type="button" variant="outline" disabled={selected === questions.length - 1} onClick={() => navigate(selected + 1)}>Next</Button></div>
      <p>Author preview only. Practice answers are not saved.</p>
    </section>}
  </div>;
}
