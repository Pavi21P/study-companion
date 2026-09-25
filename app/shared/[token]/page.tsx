import type { Metadata } from 'next';
import { SharedQuiz } from '@/components/shared-quiz';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Shared quiz | Study Companion', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function SharedPage({ params }: { params: Promise<{ token: string }> }) { return <SharedQuiz token={(await params).token}/>; }
