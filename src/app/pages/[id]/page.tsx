import { PagesShell } from '@/components/pages/PagesShell';

export default async function PageDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PagesShell pageId={id} />;
}
