import type { Metadata } from 'next';
import { SharedFolder } from '@/components/shared-folder';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Shared folder | Study Companion', robots: { index: false, follow: false }, referrer: 'no-referrer' };
export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ folderId?: string }> }) {
  const { token } = await params; const { folderId } = await searchParams;
  return <SharedFolder key={`${token}:${folderId ?? ''}`} token={token} folderId={folderId ?? null}/>;
}
