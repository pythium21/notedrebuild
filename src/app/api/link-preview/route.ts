import { NextResponse } from 'next/server';
import { fetchPageTitle } from '@/lib/linkPreview';

// Client-callable: the /saves add-form calls this before createSave() when
// the optional title field was left blank. A plain client-side fetch to an
// arbitrary external URL hits CORS for most sites, so the fetch has to
// happen server-side. See DECISIONS.md D-015.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const url = typeof body?.url === 'string' ? body.url.trim() : '';
  if (!url) {
    return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
  }

  const title = await fetchPageTitle(url);
  return NextResponse.json({ title });
}
