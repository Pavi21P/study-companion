'use client';
import Link from '@/components/app-link';
import { SharedQuiz } from '@/components/shared-quiz';
export function SharedFolderQuiz({ token, quizId, version }: { token: string; quizId: string; version: string }) {
  return <div className="quiz-editor"><Link className="text-link" href={`/shared-folders/${token}`}>Back to shared folder</Link><SharedQuiz token={token} folderContext={{ quizId, version }}/></div>;
}