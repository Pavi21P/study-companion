import Link from '@/components/app-link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { Heading } from '@/components/study-shell';
import { CourseForm } from '@/components/course-form';
import { Button } from '@/components/ui/button';
import { getStudyUser, signInPath, signInLabel, signOutPath } from '@/lib/identity';
import { getDb } from '@/db';
import { courseStore } from '@/lib/courses';

export const dynamic = 'force-dynamic';
export default async function Home() {
  const user = await getStudyUser();
  const courses = user ? await courseStore(getDb()).list(user.userId) : [];
  return <><Heading eyebrow="YOUR STUDY SPACE" title="Make your next study session count." description="Keep your courses together, ready for your next study session."/>
    {user ? <>
      <div className="section-heading"><h2>Your courses <span>({courses.length})</span></h2><a className="text-link" href={signOutPath()}>Sign out</a></div>
      <p className="account-note">Signed in as {user.displayName}. Only you can access your saved courses.</p>
      {courses.length ? <div className="course-grid">{courses.map(course => <Link key={course.id} href={`/courses/${course.id}`} className="course-card"><div className="course-body"><BookOpen aria-hidden="true"/><h2>{course.title}</h2><p>{course.description || 'Your next study session starts here.'}</p><div className="course-meta"><span>Open course</span><ArrowRight aria-hidden="true"/></div></div></Link>)}</div> : <p className="panel">No saved courses yet. Create your first course below.</p>}
      <section className="panel new-course" aria-labelledby="new-course-heading"><h2 id="new-course-heading">Create a course</h2><CourseForm/></section>
    </> : <section className="panel new-course"><h2>A study space of your own</h2><p>Sign in to create courses and save their details between visits.</p><Button nativeButton={false} render={<a href={signInPath('/courses')} aria-label={signInLabel}/>}>{signInLabel}</Button></section>}
    <section className="panel sample-callout"><div><h2>Try a sample study session</h2><p>Explore a biology quiz and flashcards with example materials.</p></div><Link className="text-link" href="/course">Open sample course <ArrowRight size={16} aria-hidden="true"/></Link></section>
  </>;
}
