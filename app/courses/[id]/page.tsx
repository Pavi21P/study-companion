import { env } from 'cloudflare:workers';
import Link from '@/components/app-link';
import { notFound } from 'next/navigation';
import { requireStudyUser } from '@/lib/identity';
import { getDb } from '@/db';
import { courseStore } from '@/lib/courses';
import { CourseForm } from '@/components/course-form';
import { Heading } from '@/components/study-shell';
import { PdfUploadForm } from '@/components/pdf-upload-form';
import { sourceStore } from '@/lib/sources';

export const dynamic = 'force-dynamic';
export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStudyUser(`/courses/${encodeURIComponent(id)}`);
  const course = await courseStore(getDb()).get(user.userId, id);
  if (!course) notFound();
  const sources = await sourceStore(getDb()).list(user.userId, id);
  return <><Link className="text-link" href="/courses">← Your courses</Link><Heading eyebrow="SAVED COURSE" title={course.title} description={course.description || 'A place for your course materials and practice.'}/>
    <section className="panel new-course" aria-labelledby="edit-course-heading"><h2 id="edit-course-heading">Course details</h2><CourseForm course={course}/></section>
    <section className="panel new-course" aria-labelledby="materials-heading"><h2 id="materials-heading">Course materials</h2>
      {env.FILES ? <PdfUploadForm courseId={course.id}/> : <p>File uploads are unavailable. You can still create and share manual quizzes.</p>}
      {sources.length ? <ul className="source-list">{sources.map(source => <li key={source.id}>
        <Link className="text-link" href={`/sources/${source.id}`}><strong>{source.filename}</strong></Link><span>{(source.byte_size / 1024).toFixed(1)} KiB</span>
        <p>{source.status === 'pending' ? 'Uploaded · Open to extract text' : source.status === 'processing' ? 'Processing · Open to resume if interrupted' : source.status === 'ready' ? 'Text ready · View passages' : source.error_message || 'Processing failed. Open to retry.'}</p>
      </li>)}</ul> : <p>No documents uploaded yet.</p>}
    </section>
  </>;
}
