import { env } from 'cloudflare:workers';
import Link from '@/components/app-link';
import { notFound } from 'next/navigation';
import { requireStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { extractionStore } from '@/lib/extraction-store';
import { ProcessPdf } from '@/components/process-pdf';
import { Heading } from '@/components/study-shell';
export const dynamic = 'force-dynamic';
export default async function SourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OwnedSource id={id}/>;
}
async function OwnedSource({ id }: { id: string }) {
  const user = await requireStudyUser(`/sources/${encodeURIComponent(id)}`);
  const store = extractionStore(getDb());
  const source = await store.get(user.userId, id);
  if (!source) notFound();
  const passages = await store.passages(user.userId, id);
  return <><Link className="text-link" href={`/courses/${source.course_id}`}>← Back to course</Link>
    <Heading eyebrow="COURSE DOCUMENT" title={source.filename} description={source.status === 'ready' ? 'Saved text with page references. Review it before creating study materials.' : 'Your original PDF is stored privately.'}/>
    {source.status !== 'ready' ? <section className="panel"><h2>Extract document text</h2>{source.error_message && <p className="error">{source.error_message}</p>}{env.FILES ? <ProcessPdf sourceId={id}/> : <p>Original files are unavailable. You can still create and share manual quizzes.</p>}</section> : <>
      <p className="source">Text was extracted in your browser. Reading order may vary in columns or tables. Page references point to the extracted passages; they are not independent verification of the PDF.</p>
      <div className="passage-list">{passages.map(passage => <section className="panel" id={`passage-${passage.id}`} key={passage.id}><h2>Page {passage.location} · Passage {passage.position + 1}</h2><p className="passage-text">{passage.content}</p></section>)}</div>
    </>}
  </>;
}
