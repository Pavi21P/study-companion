import type { Metadata } from 'next';
import { SharedFolderQuiz } from '@/components/shared-folder-quiz';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Shared quiz | Study Companion', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Page({ params, searchParams }: { params: Promise<{ token: string; id: string }>; searchParams: Promise<{ version?: string }> }) {
  const { token, id } = await params; const { version } = await searchParams;
  return <SharedFolderQuiz key={`${token}:${id}:${version}`} token={token} quizId={id} version={version ?? ''}/>;
}
