'use client';
import { useEffect, useState, type SyntheticEvent } from 'react';
import Link from '@/components/app-link';
import { QuizFolderPicker } from '@/components/quiz-folder-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { DraftQuestion, QuizDraft } from '@/lib/manual-quizzes';
import { MAX_QUIZ_QUESTIONS, MAX_QUIZ_CHOICES, MIN_QUIZ_CHOICES, MAX_QUIZ_TITLE, MAX_QUIZ_DESCRIPTION, MAX_QUESTION_PROMPT, MAX_CHOICE_TEXT, MAX_QUESTION_EXPLANATION, MAX_QUIZ_SNAPSHOT_BYTES } from '@/lib/manual-quiz-limits';

export function QuizEditor({ initialQuiz }: { initialQuiz: QuizDraft }) {
  const [quiz, setQuiz] = useState(initialQuiz); const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Draft loaded.'); const [error, setError] = useState(''); const [conflict, setConflict] = useState(false);
  const [removeId, setRemoveId] = useState<string | null>(null); const [confirmReload, setConfirmReload] = useState(false);
  const question = quiz.questions[selected];
  const bytes = new TextEncoder().encode(JSON.stringify(quiz.questions)).byteLength;
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    const navigate = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (anchor && !anchor.getAttribute('href')?.startsWith('#') && !window.confirm('Leave this page and discard unsaved changes?')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', leave); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', leave); document.removeEventListener('click', navigate, true); };
  }, [dirty]);
  function change(patch: Partial<QuizDraft>) { setQuiz(q => ({ ...q, ...patch })); setDirty(true); setMessage('Unsaved changes.'); setError(''); }
  function editQuestion(patch: Partial<DraftQuestion>) { change({ questions: quiz.questions.map((q, i) => i === selected ? { ...q, ...patch } : q) }); }
  function addQuestion() {
    change({ questions: [...quiz.questions, { id: crypto.randomUUID(), prompt: '', choices: ['', ''], correctIndex: null, explanation: '' }] }); setSelected(quiz.questions.length);
  }
  function move(direction: number) {
    const next = selected + direction; const questions = [...quiz.questions];
    [questions[selected], questions[next]] = [questions[next], questions[selected]];
    change({ questions }); setSelected(next);
  }
  async function save(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('Saving…');
    try {
      const response = await fetch(`/api/quizzes/${quiz.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: quiz.title, description: quiz.description, revision: quiz.revision, questions: quiz.questions }) });
      const data = await response.json() as { revision: number; quiz: QuizDraft; error?: string };
      if (!response.ok) { if (response.status === 409) setConflict(true); throw new Error(data.error || 'Save failed.'); }
      setQuiz(q => ({ ...q, title: q.title.trim(), revision: data.revision })); setDirty(false); setConflict(false); setMessage('All changes saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed. Please try again.'); setMessage('Changes have not been saved.'); }
    finally { setBusy(false); }
  }
  async function reload() {
    setConfirmReload(false); setRemoveId(null);
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/quizzes/${quiz.id}`, { cache: 'no-store' }); const data = await response.json() as { revision: number; quiz: QuizDraft; error?: string };
      if (!response.ok) throw new Error(data.error || 'Could not reload.');
      setQuiz(data.quiz); setSelected(0); setDirty(false); setConflict(false); setMessage('Latest saved draft loaded.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not reload.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={save} className="quiz-editor"><QuizFolderPicker quizId={quiz.id}/>
    <div className="panel">{dirty ? <p>Save your changes to preview and publish this draft.</p> : <Link className="text-link" href={`/quizzes/${quiz.id}/preview`}>Preview and publish saved draft →</Link>}</div>
    <div className="panel editor-save"><div><strong>Private draft</strong><output aria-live="polite">{message}</output></div><Button type="submit" disabled={busy || !dirty || conflict || bytes > MAX_QUIZ_SNAPSHOT_BYTES}>{busy ? 'Please wait…' : 'Save draft'}</Button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {conflict && <Button type="button" variant="outline" onClick={() => setConfirmReload(true)} disabled={busy}>Reload saved draft</Button>}
    {confirmReload && <section className="panel" aria-labelledby="reload-confirm"><h2 id="reload-confirm">Discard unsaved edits?</h2><p>This loads the latest saved draft and replaces your unsaved changes.</p><div className="actions"><Button type="button" onClick={reload} disabled={busy}>Discard edits and reload</Button><Button type="button" variant="outline" onClick={() => setConfirmReload(false)}>Keep editing</Button></div></section>}
    <fieldset disabled={busy} className="editor-fields">
      <section className="panel editor-section" aria-labelledby="quiz-details"><h2 id="quiz-details">Quiz details</h2>
        <Label htmlFor="quiz-title">Title</Label><Input id="quiz-title" required maxLength={MAX_QUIZ_TITLE} value={quiz.title} onChange={e => change({ title: e.target.value })}/>
        <Label htmlFor="quiz-description">Description (optional)</Label><Textarea id="quiz-description" maxLength={MAX_QUIZ_DESCRIPTION} value={quiz.description} onChange={e => change({ description: e.target.value })}/>
      </section>
      <section className="panel editor-section" aria-labelledby="quiz-questions"><div className="section-heading"><h2 id="quiz-questions">Questions ({quiz.questions.length}/{MAX_QUIZ_QUESTIONS})</h2><Button type="button" onClick={addQuestion} disabled={quiz.questions.length >= MAX_QUIZ_QUESTIONS}>Add question</Button></div>
        <p>Save incomplete questions as drafts. Add a prompt, choices and the correct answer when you’re ready.</p>
        <p className={bytes > MAX_QUIZ_SNAPSHOT_BYTES ? 'error' : ''}>{(bytes / 1000).toFixed(1)} / {MAX_QUIZ_SNAPSHOT_BYTES / 1000} KB of question content{bytes > MAX_QUIZ_SNAPSHOT_BYTES ? ' — Shorten the text to save this quiz.' : ''}</p>
        {question ? <>
          <Label htmlFor="question-jump">Current question</Label><select id="question-jump" className="question-select" value={selected} onChange={e => setSelected(Number(e.target.value))}>{quiz.questions.map((q, i) => <option key={q.id} value={i}>Question {i + 1}{q.prompt ? `: ${q.prompt.slice(0, 60)}` : ' (empty)'}</option>)}</select>
          <div className="actions"><Button type="button" variant="outline" disabled={selected === 0} onClick={() => setSelected(selected - 1)}>Previous</Button><Button type="button" variant="outline" disabled={selected === quiz.questions.length - 1} onClick={() => setSelected(selected + 1)}>Next</Button><Button type="button" variant="outline" disabled={selected === 0} onClick={() => move(-1)}>Move up</Button><Button type="button" variant="outline" disabled={selected === quiz.questions.length - 1} onClick={() => move(1)}>Move down</Button></div>
          <h3>Question {selected + 1}</h3><Label htmlFor="question-prompt">Question prompt</Label><Textarea id="question-prompt" maxLength={MAX_QUESTION_PROMPT} value={question.prompt} onChange={e => editQuestion({ prompt: e.target.value })}/>
          <fieldset className="editor-choices"><legend>Answer choices</legend>{question.choices.map((choice, i) => <div className="editor-choice" key={`${question.id}-${i}`}><Label htmlFor={`choice-${i}`}>Choice {i + 1}</Label><Input id={`choice-${i}`} maxLength={MAX_CHOICE_TEXT} value={choice} onChange={e => editQuestion({ choices: question.choices.map((c, n) => n === i ? e.target.value : c) })}/><Button type="button" variant="outline" aria-label={`Remove choice ${i + 1}`} disabled={question.choices.length <= MIN_QUIZ_CHOICES} onClick={() => editQuestion({ choices: question.choices.filter((_, n) => n !== i), correctIndex: question.correctIndex === i ? null : question.correctIndex !== null && question.correctIndex > i ? question.correctIndex - 1 : question.correctIndex })}>Remove</Button></div>)}<Button type="button" variant="outline" disabled={question.choices.length >= MAX_QUIZ_CHOICES} onClick={() => editQuestion({ choices: [...question.choices, ''] })}>Add choice</Button></fieldset>
          <Label htmlFor="correct-answer">Correct answer</Label><select id="correct-answer" className="question-select" value={question.correctIndex ?? ''} onChange={e => editQuestion({ correctIndex: e.target.value === '' ? null : Number(e.target.value) })}><option value="">Choose later</option>{question.choices.map((_, i) => <option key={i} value={i}>Choice {i + 1}</option>)}</select>
          <Label htmlFor="question-explanation">Explanation (optional)</Label><Textarea id="question-explanation" maxLength={MAX_QUESTION_EXPLANATION} value={question.explanation} onChange={e => editQuestion({ explanation: e.target.value })}/>
          <Button type="button" variant="outline" onClick={() => setRemoveId(question.id)}>Remove question</Button>
          {removeId === question.id && <section className="panel" aria-labelledby="remove-confirm"><h3 id="remove-confirm">Remove question {selected + 1}?</h3><p>This takes effect when you save the draft.</p><div className="actions"><Button type="button" onClick={() => { change({ questions: quiz.questions.filter(q => q.id !== removeId) }); setSelected(Math.max(0, selected - 1)); setRemoveId(null); }}>Confirm removal</Button><Button type="button" variant="outline" onClick={() => setRemoveId(null)}>Keep question</Button></div></section>}
        </> : <p>No questions yet. Add your first question above.</p>}
      </section>
    </fieldset>
  </form>;
}
