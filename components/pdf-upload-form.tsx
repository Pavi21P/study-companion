'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { MAX_PDF_BYTES } from '@/lib/pdf-upload';

export function PdfUploadForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  async function upload(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    const form = event.currentTarget;
    setBusy(true); setFailed(false); setMessage('Uploading your PDF…');
    try {
      const response = await fetch(`/api/courses/${courseId}/sources`, {
        method: 'POST', headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name) }, body: file,
      });
      const result = await response.json() as { error?: string; source?: { id: string } };
      if (!response.ok) throw new Error(result.error ?? 'Unable to upload this PDF.');
      setFile(null); form.reset(); setMessage('PDF uploaded. Opening text extraction…');
      if (result.source) router.push(`/sources/${result.source.id}`);
    } catch (error) {
      setFailed(true); setMessage(error instanceof Error ? error.message : 'Unable to connect. Try again.');
    } finally { setBusy(false); router.refresh(); }
  }
  return <form onSubmit={upload} className="course-form">
    <div><label htmlFor="course-pdf"><strong>Add a PDF</strong></label>
      <p id="pdf-help">One text-based PDF, up to 10 MiB and 100 pages. Upload privately, then extract text with page references. Scanned PDFs need OCR, which is not supported.</p>
      <input id="course-pdf" className="file-field" type="file" accept=".pdf,application/pdf" disabled={busy} aria-describedby="pdf-help pdf-status" onChange={event => {
        const selected = event.target.files?.[0]; setFile(null); setMessage(''); setFailed(false);
        if (!selected) return;
        const error = !/\.pdf$/i.test(selected.name) ? 'Choose a PDF file.' : selected.size > MAX_PDF_BYTES ? 'This PDF is larger than 10 MiB. Choose a smaller file.' : !selected.size ? 'This file is empty.' : '';
        if (error) { setFailed(true); setMessage(error); return; }
        setFile(selected);
      }}/>
    </div>
    <Button type="submit" disabled={!file || busy}>{busy ? 'Uploading…' : 'Upload PDF'}</Button>
    <output id="pdf-status" className={failed ? 'error' : 'save-message'}>{message}</output>
  </form>;
}
