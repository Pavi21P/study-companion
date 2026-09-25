import Link from '@/components/app-link';
import { notFound } from 'next/navigation';
import { requireStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { manualQuizStore, type DraftQuestion } from '@/lib/manual-quizzes';
import { publicationIssues } from '@/lib/quiz-publication';
import { Heading } from '@/components/study-shell';
import { QuizPreview } from '@/components/quiz-preview';
import { QuizSharing } from '@/components/quiz-sharing';
import { sharingStore } from '@/lib/quiz-sharing';
export const dynamic = 'force-dynamic';
export default async function PreviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ version?: string }> }) {
  return <OwnedPreview id={(await params).id} versionId={(await searchParams).version}/>;
}
async function OwnedPreview({ id, versionId }: { id: string; versionId?: string }) {
  const user = await requireStudyUser(`/quizzes/${encodeURIComponent(id)}/preview${versionId ? `?version=${encodeURIComponent(versionId)}` : ''}`);
  const store = manualQuizStore(getDb()); const draft = await store.get(user.userId, id);
  if (!draft) notFound();
  const version = versionId ? await store.version(user.userId, id, versionId) : null;
  if (versionId && !version) notFound();
  const content = version ? { title: version.title, description: version.description, revision: version.draft_revision, questions: JSON.parse(version.questions_json) as DraftQuestion[] } : { title: draft.title, description: draft.description, revision: draft.revision, questions: draft.questions };
  const versions = await store.versions(user.userId, id);
  const shares = version ? await sharingStore(getDb()).list(user.userId, id) : [];
  return <><Link className="text-link" href={`/quizzes/${id}`}>← Edit draft</Link><Heading eyebrow={version ? 'PUBLISHED QUIZ PREVIEW' : 'SAVED DRAFT PREVIEW'} title={content.title} description={content.description || `${content.questions.length} questions · Revision ${content.revision}`}/>
    <QuizPreview key={version?.id ?? `draft-${draft.revision}`} id={id} revision={content.revision} questions={content.questions} issues={version ? [] : publicationIssues(content)} published={!!version}/>
    {version && <QuizSharing key={version.id} quizId={id} versionId={version.id} initialShares={shares}/>}
    {!!versions.length && <section className="panel"><h2>Published versions</h2><ul>{versions.map(v => <li key={v.id}><Link className="text-link" href={`/quizzes/${id}/preview?version=${v.id}`}>View published revision {v.draft_revision}</Link></li>)}</ul>{version && <Link className="text-link" href={`/quizzes/${id}/preview`}>Preview current saved draft</Link>}</section>}
  </>;
}
