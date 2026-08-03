import { supabase } from './supabaseClient';

export type Platform = 'YouTube' | 'Articles' | 'LinkedIn' | 'Facebook' | 'Reddit' | 'Websites';

export const PLATFORMS: Platform[] = [
  'YouTube',
  'Articles',
  'LinkedIn',
  'Facebook',
  'Reddit',
  'Websites',
];

export interface Save {
  id: string;
  user_id: string;
  url: string;
  title: string;
  platform: Platform;
  date: string | null;
  created_at: string;
}

// Strips tracking params (utm_* and rcm) so the same link saved from
// different shares/campaigns doesn't produce visually-different duplicates.
export function cleanUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return rawUrl;
  }

  const toDelete: string[] = [];
  parsed.searchParams.forEach((_value, key) => {
    if (/^utm_/i.test(key) || key.toLowerCase() === 'rcm') {
      toDelete.push(key);
    }
  });
  toDelete.forEach((key) => parsed.searchParams.delete(key));

  return parsed.toString();
}

const ARTICLE_HOSTS = [
  'medium.com',
  'substack.com',
  'dev.to',
  'wikipedia.org',
  'nytimes.com',
  'theguardian.com',
  'wsj.com',
];

export function detectPlatform(rawUrl: string): Platform {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'Websites';
  }

  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
  if (host.includes('linkedin.com')) return 'LinkedIn';
  if (host.includes('facebook.com') || host.includes('fb.watch')) return 'Facebook';
  if (host.includes('reddit.com') || host.includes('redd.it')) return 'Reddit';
  if (ARTICLE_HOSTS.some((articleHost) => host === articleHost || host.endsWith(`.${articleHost}`))) {
    return 'Articles';
  }
  return 'Websites';
}

export async function listSaves(): Promise<Save[]> {
  const { data, error } = await supabase
    .from('saves')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Save[];
}

export async function createSave(input: {
  url: string;
  title?: string;
  platform?: Platform;
}): Promise<Save> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const url = cleanUrl(input.url.trim());
  const title = input.title?.trim() || url;
  const platform = input.platform || detectPlatform(url);

  const { data, error } = await supabase
    .from('saves')
    .insert({
      user_id: userData.user.id,
      url,
      title,
      platform,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Save;
}
