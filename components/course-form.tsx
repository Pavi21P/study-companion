'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { Course } from '@/lib/courses';

export function CourseForm({ course }: { course?: Course }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  async function save(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    setBusy(true); setMessage(''); setFailed(false);
    try {
      const response = await fetch(course ? `/api/courses/${course.id}` : '/api/courses', {
        method: course ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: data.get('title'), description: data.get('description') }),
      });
      const result = await response.json() as { course?: Course; error?: string };
      if (!response.ok || !result.course) throw new Error(result.error ?? 'Unable to save this course.');
      if (course) { setMessage('Changes saved.'); router.refresh(); }
      else { router.push(`/courses/${result.course.id}`); router.refresh(); }
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Unable to connect. Please try again.');
    } finally { setBusy(false); }
  }
  return <form onSubmit={save} className="course-form">
    <div><Label htmlFor="course-title">Course title</Label><Input id="course-title" name="title" required maxLength={120} defaultValue={course?.title ?? ''} placeholder="e.g. Introduction to Biology" disabled={busy}/></div>
    <div><Label htmlFor="course-description">Description <span>(optional)</span></Label><Textarea id="course-description" name="description" maxLength={1000} defaultValue={course?.description ?? ''} placeholder="What will you be studying?" rows={3} disabled={busy}/></div>
    <Button type="submit" disabled={busy}>{busy ? 'Saving…' : course ? 'Save changes' : 'Create course'}</Button>
    <output className={failed ? 'error' : 'save-message'}>{message}</output>
  </form>;
}
