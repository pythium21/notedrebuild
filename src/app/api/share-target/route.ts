import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
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
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : url;
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
