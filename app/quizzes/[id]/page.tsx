import Link from '@/components/app-link';
import { notFound } from 'next/navigation';
import { requireStudyUser } from '@/lib/identity';
import { Heading } from '@/components/study-shell';
import { QuizEditor } from '@/components/quiz-editor';
import { getDb } from '@/db';
import { manualQuizStore } from '@/lib/manual-quizzes';
export const dynamic = 'force-dynamic';
export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) { return <OwnedQuiz id={(await params).id}/>; }
async function OwnedQuiz({ id }: { id: string }) {
  const user = await requireStudyUser(`/quizzes/${encodeURIComponent(id)}`);
  const quiz = await manualQuizStore(getDb()).get(user.userId, id);
  if (!quiz) notFound();
  return <><Link className="text-link" href="/">← Back to quizzes</Link><Heading eyebrow="MANUAL QUIZ EDITOR" title="Build your quiz" description="Write your own questions, choose the answers and save your work. No AI or uploaded files needed."/><QuizEditor initialQuiz={quiz}/></>;
}
