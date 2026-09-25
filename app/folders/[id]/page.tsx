import { FolderPage } from '@/components/folder-page';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <FolderPage id={(await params).id}/>;
}
