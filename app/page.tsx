import Link from '@/components/app-link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Heading } from '@/components/study-shell';
import { CreateQuiz } from '@/components/create-quiz';
import { Button } from '@/components/ui/button';
import { getStudyUser, signInPath, signInLabel, signOutPath } from '@/lib/identity';
import { getDb } from '@/db';
import { manualQuizStore } from '@/lib/manual-quizzes';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getStudyUser();
  const quizzes = user ? await manualQuizStore(getDb()).list(user.userId) : [];
  return <><Heading eyebrow="YOUR QUIZ LIBRARY" title="Your questions. Your study space." description="Create quizzes by hand with up to 500 questions. No AI subscription or document upload needed."/>
    {user ? <>
      <div className="section-heading"><h2>Your quizzes <span>({quizzes.length})</span></h2><CreateQuiz/></div>
      <p className="account-note">Signed in as {user.displayName}. Your drafts are private. <a className="text-link" href={signOutPath()}>Sign out</a></p>
      {quizzes.length ? <div className="course-grid">{quizzes.map(quiz => <Link key={quiz.id} href={`/quizzes/${quiz.id}`} className="course-card"><div className="course-body"><BookOpen aria-hidden="true"/><h2>{quiz.title}</h2><p>{quiz.description || 'Keep building your next study session.'}</p><div className="course-meta"><span>Draft · {quiz.question_count} questions</span><ArrowRight aria-hidden="true"/></div></div></Link>)}</div> : <section className="panel"><h2>Start with your first quiz</h2><p>Give it a title, add questions and save a draft. You can come back and edit it anytime.</p></section>}
    </> : <section className="panel"><h2>A quiz library of your own</h2><p>Sign in to create and save manual quizzes.</p><Button nativeButton={false} render={<a href={signInPath('/')} aria-label={signInLabel}/>}>{signInLabel}</Button></section>}
    <section className="panel sample-callout"><div><h2>Course files</h2><p>Keep your course notes and PDFs nearby while you write questions.</p></div><Link className="text-link" href="/courses">Open course files <ArrowRight size={16} aria-hidden="true"/></Link></section>
  </>;
}