import { createClient } from '@supabase/supabase-js';

// `||` not `??`: an empty string from a misconfigured env var must fall
// through to the placeholder too, not just `undefined`/`null`.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
