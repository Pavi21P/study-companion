'use client';
import { clientResponse } from '@/lib/client-response';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { GuestQuiz } from '@/lib/quiz-sharing';
import type { GuestResult } from '@/lib/guest-attempts';
export function SharedQuiz({ token, folderContext }: { token: string; folderContext?: { quizId: string; version: string } }) {
  const base = folderContext
    ? `/api/shared-folders/${encodeURIComponent(token)}/quizzes/${encodeURIComponent(folderContext.quizId)}`
    : `/api/shared/${encodeURIComponent(token)}`;
  const query = folderContext ? `?version=${encodeURIComponent(folderContext.version)}` : '';
  const quizUrl = `${base}${query}`;
  const attemptUrl = `${base}/attempt${query}`;
  const storageKey = folderContext ? `study-folder-attempt:${token}:${folderContext.quizId}:${folderContext.version}` : `study-attempt:${token}`;
  return <QuizRunner key={storageKey} quizUrl={quizUrl} attemptUrl={attemptUrl} storageKey={storageKey}/>;
}
function QuizRunner({ quizUrl, attemptUrl, storageKey }: { quizUrl: string; attemptUrl: string; storageKey: string }) {
  const [quiz, setQuiz] = useState<GuestQuiz | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0); const [answers, setAnswers] = useState<Record<string, number>>({}); const [reload, setReload] = useState(0);
  const [result, setResult] = useState<GuestResult | null>(null); const [busy, setBusy] = useState(false); const [storageWarning, setStorageWarning] = useState('');
  const attemptKey = useRef<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(''); setQuiz(null);
      try {
        const response = await fetch(quizUrl, { cache: 'no-store', signal: controller.signal }); const data = await response.json().catch(() => ({ error: 'Could not load the quiz. Please try again.' })) as { quiz?: GuestQuiz; error?: string };
        if (!response.ok || !data.quiz) throw new Error(data.error || 'Could not load the quiz.');
        let restored: GuestResult | null = null;
        try { attemptKey.current = sessionStorage.getItem(storageKey); }
        catch { setStorageWarning('This browser cannot remember your result after you leave this page.'); }
        if (attemptKey.current) {
          const saved = await fetch(attemptUrl, { headers: { 'X-Attempt-Key': attemptKey.current }, cache: 'no-store', signal: controller.signal });
          if (saved.ok) restored = (await clientResponse(saved) as { result: GuestResult }).result;
          else if (saved.status !== 404) throw new Error('Could not restore your result. Please try again.');
        }
        if (controller.signal.aborted) return;
        setQuiz(data.quiz); setSelected(0); setResult(restored); setAnswers(restored ? Object.fromEntries(restored.answers.map(a => [a.questionId, a.selectedIndex])) : {});
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load the quiz.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [quizUrl, attemptUrl, storageKey, reload]);
  async function submit() {
    if (!quiz || busy || result || Object.keys(answers).length !== quiz.questions.length) return;
    setBusy(true); setError('');
    try {
      if (!attemptKey.current) attemptKey.current = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
      try { sessionStorage.setItem(storageKey, attemptKey.current); }
      catch { setStorageWarning('This browser cannot remember your result after you leave this page.'); }
      const response = await fetch(attemptUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Attempt-Key': attemptKey.current }, body: JSON.stringify({ answers: quiz.questions.map(q => ({ questionId: q.id, selectedIndex: answers[q.id] })) }) });
      const data = await response.json().catch(() => ({ error: 'Could not save your result. Your answers are still here; please try again.' })) as { result?: GuestResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || 'Could not save your result. Please try again.');
      setResult(data.result); setAnswers(Object.fromEntries(data.result.answers.map(a => [a.questionId, a.selectedIndex]))); setSelected(0);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not submit. Your answers are still here.'); }
    finally { setBusy(false); }
  }
  if (loading) return <section className="panel"><h1>Loading shared quiz…</h1></section>;
  if (!quiz) return <section className="panel"><h1>Quiz unavailable</h1><p role="alert">{error}</p><Button onClick={() => setReload(n => n + 1)}>Try again</Button></section>;
  const question = quiz.questions[selected];
  const reviewed = result?.answers.find(a => a.questionId === question.id);
  return <div className="quiz-editor"><header className="page-heading"><p className="eyebrow">SHARED QUIZ</p><h1>{quiz.title}</h1>{quiz.description && <p>{quiz.description}</p>}</header>
    {result && <section className="panel" aria-labelledby="quiz-result"><h2 id="quiz-result">Your result: {result.score} / {result.total}</h2><p>{Math.round(result.score / result.total * 100)}% correct. Your submitted result is saved. Review your answers below.</p></section>}
    {error && <p className="error" role="alert">{error}</p>}{storageWarning && <p>{storageWarning}</p>}
    <section className="panel editor-section" aria-labelledby="shared-question"><p>{Object.keys(answers).length} of {quiz.questions.length} answered</p><label htmlFor="shared-jump">Question</label><select id="shared-jump" className="question-select" value={selected} onChange={e => setSelected(Number(e.target.value))}>{quiz.questions.map((q, i) => <option key={q.id} value={i}>Question {i + 1}{answers[q.id] !== undefined ? ' — answered' : ''}</option>)}</select>
      <h2 id="shared-question">{question.prompt}</h2><fieldset className="editor-choices" disabled={busy || !!result}><legend>{result ? 'Your submitted answer' : 'Choose an answer'}</legend>{question.choices.map((choice, i) => <label className="preview-choice" key={`${question.id}-${i}`}><input type="radio" name="shared-answer" checked={answers[question.id] === i} onChange={() => setAnswers(current => ({ ...current, [question.id]: i }))}/><span>{choice}</span></label>)}</fieldset>
      {reviewed && <section className="panel"><h3>{reviewed.selectedIndex === reviewed.correctIndex ? 'Correct' : 'Incorrect'}</h3><p>Correct answer: {question.choices[reviewed.correctIndex]}</p>{reviewed.explanation && <p className="passage-text">{reviewed.explanation}</p>}</section>}
      <div className="actions"><Button variant="outline" disabled={selected === 0} onClick={() => setSelected(n => n - 1)}>Previous</Button><Button variant="outline" disabled={selected === quiz.questions.length - 1} onClick={() => setSelected(n => n + 1)}>Next</Button></div>
      {!result && <><Button onClick={submit} disabled={busy || Object.keys(answers).length !== quiz.questions.length}>{busy ? 'Saving result…' : 'Submit answers'}</Button><p>Answer every question before submitting. Unsubmitted selections are cleared on reload. Submitted results can be reopened in this browser tab while the link remains active.</p></>}
    </section></div>;
}
