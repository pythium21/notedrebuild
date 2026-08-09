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

// Title update for the share page's optional after-save prompt (shown when no
// title could be fetched — e.g. Reddit blocks all automated access, DECISIONS.md
// D-015). Same no-session model as POST: service-role client, rows scoped to
// NOTED_USER_ID.
export async function PATCH(request: Request) {
  const userId = process.env.NOTED_USER_ID || '';
  if (!userId) {
    return NextResponse.json({ error: 'NOTED_USER_ID is not configured' }, { status: 500 });
  }

  const body = await request.json();
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!id || !title) {
    return NextResponse.json({ error: 'id and title are required' }, { status: 400 });
  }

  const { data, error } = await getSupabaseService()
    .from('saves')
    .update({ title })
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
