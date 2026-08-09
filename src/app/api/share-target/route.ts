import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { fetchPageTitle } from '@/lib/linkPreview';
import { cleanUrl, detectPlatform } from '@/lib/saves';

// Service-role client, created inside this route handler only — never
// imported into client-rendered code (see CLAUDE.md / DECISIONS.md D-009).
function getSupabaseService() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(supabaseUrl, serviceRoleKey);
}

export async function POST(request: Request) {
  const userId = process.env.NOTED_USER_ID || '';
  if (!userId) {
    return NextResponse.json({ error: 'NOTED_USER_ID is not configured' }, { status: 500 });
  }

  const body = await request.json();

  // Diagnostic only — see MISTAKES.md / Reddit title investigation.
  console.log('[share-target] raw payload:', {
    title: body.title,
    text: body.text,
    url: body.url,
  });

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';
  if (!rawUrl) {
    return NextResponse.json({ error: 'No URL provided' }, { status: 400 });
  }

  const url = cleanUrl(rawUrl);
  const suppliedTitle = typeof body.title === 'string' ? body.title.trim() : '';
  // Android share payloads often omit a title — or worse, pass the URL itself
  // AS the title, which is just as useless. Treat both as "no title" and fall
  // back to a server-side fetch of the page's own title before giving up and
  // using the raw URL. See DECISIONS.md D-015.
  const suppliedIsUrl = /^https?:\/\//i.test(suppliedTitle);
  const title =
    suppliedTitle && !suppliedIsUrl ? suppliedTitle : (await fetchPageTitle(url)) || suppliedTitle || url;
  const platform = detectPlatform(url);

  // Diagnostic only — see MISTAKES.md / Reddit title investigation.
  console.log('[share-target] resolved:', { url, title, platform, suppliedTitle, suppliedIsUrl });

  const { data, error } = await getSupabaseService()
    .from('saves')
    .insert({
      user_id: userId,
      url,
      title,
      platform,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
