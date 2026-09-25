'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { extractPdf, PdfExtractionError } from '@/lib/extract-pdf';

export function ProcessPdf({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  async function post(body: unknown) {
    const response = await fetch(`/api/sources/${sourceId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'Unable to save extracted text.');
  }
  async function process() {
    if (busy) return;
    setBusy(true); setFailed(false); setMessage('Loading your PDF…');
    try {
      await post({ action: 'start' });
      const response = await fetch(`/api/sources/${sourceId}`);
      if (!response.ok) throw new Error('The original PDF could not be loaded. Retry or upload it again.');
      const pages = await extractPdf(new Uint8Array(await response.arrayBuffer()), (page, total) => setMessage(`Reading page ${page} of ${total}…`));
      setMessage('Saving page references…');
      await post({ action: 'complete', pages });
      setMessage('Text saved.');
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : 'Processing failed. Please retry.');
      if (error instanceof PdfExtractionError) {
        try { await post({ action: 'fail', code: error.code }); }
        catch { setMessage(`${error.message} The failure could not be saved; you can retry here.`); }
      }
    } finally { setBusy(false); router.refresh(); }
  }
  return <div className="course-form"><p>Extract up to 100 pages and 150,000 characters. Keep this page open while processing. If interrupted, return here to retry.</p><Button onClick={process} disabled={busy}>{busy ? 'Processing…' : 'Extract text / retry'}</Button><output className={failed ? 'error' : 'save-message'}>{message}</output></div>;
}
