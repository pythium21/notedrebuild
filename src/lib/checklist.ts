import { supabase } from './supabaseClient';

// Recurring Items — a fully separate system from tasks (DECISIONS.md D-018,
// supersedes D-016's placement/scope but reuses its schema). checklist_items
// is the persistent recurring-item list; checklist_completions logs one row
// per item per calendar day so history survives for streak/rate views.

export type Frequency = 'daily' | 'weekly' | 'monthly';

export interface ChecklistItem {
  id: string;
  user_id: string;
  title: string;
  sort_order: number;
  archived: boolean;
  created_at: string;
  frequency: Frequency;
  days_of_week: number[] | null;
  day_of_month: number | null;
}

export interface ChecklistItemToday extends ChecklistItem {
  completedToday: boolean;
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// "Today" is the user's local calendar date, not UTC — toISOString() would
// flip to tomorrow at local evening for timezones ahead of UTC.
export function localToday(): string {
  return formatLocalDate(new Date());
}

function isoWeekday(dateStr: string): number {
  const day = parseLocalDate(dateStr).getDay(); // 0 (Sun) .. 6 (Sat)
  return day === 0 ? 7 : day; // 1 (Mon) .. 7 (Sun)
}

function lastDayOfMonth(dateStr: string): number {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m, 0).getDate(); // day 0 of next month = last day of this month
}

// Pure function — daily is always due; weekly checks days_of_week; monthly
// checks day_of_month, clamped to the last day of short months (e.g. 31 in
// February matches Feb 28/29 rather than never firing that month).
export function isDueOn(item: ChecklistItem, date: string): boolean {
  if (item.frequency === 'daily') return true;
  if (item.frequency === 'weekly') {
    return (item.days_of_week || []).includes(isoWeekday(date));
  }
  if (item.frequency === 'monthly') {
    if (item.day_of_month == null) return false;
    const clamped = Math.min(item.day_of_month, lastDayOfMonth(date));
    return parseLocalDate(date).getDate() === clamped;
  }
  return false;
}

export async function listRecurringForToday(): Promise<ChecklistItemToday[]> {
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
  return (data as Row[])
    .map(({ checklist_completions, ...item }) => ({
      ...item,
      completedToday: (checklist_completions || []).length > 0,
    }))
    .filter((item) => isDueOn(item, today));
}

// Daily items only — walk backward from yesterday (today doesn't count until
// completed) counting consecutive completed due-dates until the first miss
// or the item's creation date, whichever comes first.
export async function getStreak(itemId: string): Promise<number> {
  const { data: itemData, error: itemError } = await supabase
    .from('checklist_items')
    .select('created_at')
    .eq('id', itemId)
    .single();
  if (itemError) throw itemError;
  const createdDate = (itemData as { created_at: string }).created_at.slice(0, 10);

  const { data: completions, error } = await supabase
    .from('checklist_completions')
    .select('date')
    .eq('item_id', itemId);
  if (error) throw error;
  const completedDates = new Set((completions as { date: string }[]).map((c) => c.date));

  let streak = 0;
  const cursor = parseLocalDate(localToday());
  cursor.setDate(cursor.getDate() - 1);
  while (formatLocalDate(cursor) >= createdDate) {
    const dateStr = formatLocalDate(cursor);
    if (!completedDates.has(dateStr)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// Weekly/monthly items — enumerate due dates in [periodStart, periodEnd] via
// isDueOn, then count how many have a matching completion row.
export async function getCompletionRate(
  itemId: string,
  periodStart: string,
  periodEnd: string,
): Promise<{ done: number; due: number }> {
  const { data: itemData, error: itemError } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('id', itemId)
    .single();
  if (itemError) throw itemError;
  const item = itemData as ChecklistItem;

  const { data: completions, error } = await supabase
    .from('checklist_completions')
    .select('date')
    .eq('item_id', itemId)
    .gte('date', periodStart)
    .lte('date', periodEnd);
  if (error) throw error;
  const completedDates = new Set((completions as { date: string }[]).map((c) => c.date));

  let due = 0;
  let done = 0;
  const cursor = parseLocalDate(periodStart);
  const end = parseLocalDate(periodEnd);
  while (cursor <= end) {
    const dateStr = formatLocalDate(cursor);
    if (isDueOn(item, dateStr)) {
      due++;
      if (completedDates.has(dateStr)) done++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { done, due };
}

export async function createChecklistItem(
  title: string,
  sortOrder: number,
  frequency: Frequency,
  daysOfWeek?: number[],
  dayOfMonth?: number,
): Promise<ChecklistItem> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('checklist_items')
    .insert({
      user_id: userData.user.id,
      title,
      sort_order: sortOrder,
      frequency,
      days_of_week: frequency === 'weekly' ? daysOfWeek || [] : null,
      day_of_month: frequency === 'monthly' ? dayOfMonth : null,
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

// Archive, never hard-delete — completion history must survive for streak/
// completion-rate views (D-016, carried forward by D-018).
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
