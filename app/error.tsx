'use client';
import { Button } from '@/components/ui/button';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="panel"><h1>Unable to load this page</h1><p>Please try again in a moment.</p><Button onClick={reset}>Try again</Button></section>;
}
