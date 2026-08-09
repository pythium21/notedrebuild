import { supabase } from './supabaseClient';

// Daily Checklist — a fully separate system from tasks (DECISIONS.md D-016).
// checklist_items is the persistent habit list; checklist_completions logs one
// row per item per calendar day so history survives for future streak views.

export interface ChecklistItem {
  id: string;
  user_id: string;
  title: string;
  sort_order: number;
  archived: boolean;
  created_at: string;
}

export interface ChecklistItemToday extends ChecklistItem {
  completedToday: boolean;
}

// "Today" is the user's local calendar date, not UTC — toISOString() would
// flip to tomorrow at local evening for timezones ahead of UTC.
export function localToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function listChecklistForToday(): Promise<ChecklistItemToday[]> {
  const today = localToday();
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*, checklist_completions(id)')
    .eq('archived', false)
    .eq('checklist_completions.date', today)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  type Row = ChecklistItem & { checklist_completions: { id: string }[] | null };
  return (data as Row[]).map(({ checklist_completions, ...item }) => ({
    ...item,
    completedToday: (checklist_completions || []).length > 0,
  }));
}

export async function createChecklistItem(title: string, sortOrder: number): Promise<ChecklistItem> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('checklist_items')
    .insert({
      user_id: userData.user.id,
      title,
      sort_order: sortOrder,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ChecklistItem;
}

export async function updateChecklistItemTitle(id: string, title: string): Promise<void> {
  const { error } = await supabase.from('checklist_items').update({ title }).eq('id', id);
  if (error) throw error;
}

export async function setChecklistItemSortOrder(id: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from('checklist_items')
    .update({ sort_order: sortOrder })
    .eq('id', id);
  if (error) throw error;
}

// Archive, never hard-delete — completion history must survive for future
// progress/streak views (D-016).
export async function archiveChecklistItem(id: string): Promise<void> {
  const { error } = await supabase.from('checklist_items').update({ archived: true }).eq('id', id);
  if (error) throw error;
}

export async function setCompletedToday(itemId: string, completed: boolean): Promise<void> {
  const date = localToday();
  if (completed) {
    // upsert with ignoreDuplicates so a double-tap racing the unique
    // (item_id, date) constraint doesn't surface as an error.
    const { error } = await supabase
      .from('checklist_completions')
      .upsert({ item_id: itemId, date }, { onConflict: 'item_id,date', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('checklist_completions')
      .delete()
      .eq('item_id', itemId)
      .eq('date', date);
    if (error) throw error;
  }
}
