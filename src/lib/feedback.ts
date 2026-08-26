import { supabase } from './supabaseClient';

export type FeedbackType = 'bug' | 'idea' | 'general';
export type FeedbackSeverity = 'blocker' | 'minor';

export interface TesterFeedback {
  id: string;
  user_id: string;
  type: FeedbackType;
  description: string;
  severity: FeedbackSeverity | null;
  screenshot_path: string | null;
  page_route: string | null;
  status: string;
  admin_notes: string | null;
  created_at: string;
}

const SCREENSHOT_BUCKET = 'feedback-screenshots';
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function validateScreenshot(file: File): string | null {
  if (!ALLOWED_SCREENSHOT_TYPES.includes(file.type)) {
    return 'Screenshot must be a PNG, JPEG, or WebP image.';
  }
  if (file.size > MAX_SCREENSHOT_BYTES) {
    return 'Screenshot must be under 5MB.';
  }
  return null;
}

async function uploadScreenshot(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'png';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(SCREENSHOT_BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

export async function submitFeedback(input: {
  type: FeedbackType;
  description: string;
  severity: FeedbackSeverity | null;
  pageRoute: string | null;
  screenshot: File | null;
}): Promise<TesterFeedback> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const screenshotPath = input.screenshot
    ? await uploadScreenshot(userData.user.id, input.screenshot)
    : null;

  const { data, error } = await supabase
    .from('tester_feedback')
    .insert({
      user_id: userData.user.id,
      type: input.type,
      description: input.description.trim(),
      severity: input.type === 'bug' ? input.severity : null,
      screenshot_path: screenshotPath,
      page_route: input.pageRoute,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TesterFeedback;
}
