import { supabase } from './supabaseClient';
import { localToday, setCompletedToday, type Frequency } from './checklist';

// Entry Tracking — individual logged entries against a tracked recurring
// item (DECISIONS.md D-022). Every log/delete recalculates the current
// period's count and syncs checklist_completions so the existing
// streak/completion-rate logic (checklist.ts) keeps working unchanged.

export interface RecurringEntry {
  id: string;
  checklist_item_id: string;
  entry_label_id: string | null;
  user_id: string;
  value: number | null;
  note: string | null;
  logged_at: string;
  created_at: string;
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfLocalDay(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function endOfLocalDay(dateStr: string): Date {
  return new Date(startOfLocalDay(dateStr).getTime() + 24 * 60 * 60 * 1000 - 1);
}

// Monday-first week containing today, per D-022's weekly auto-complete rule.
export function currentWeekRange(): { start: string; end: string } {
  const today = new Date();
  const isoDay = today.getDay() === 0 ? 7 : today.getDay(); // 1=Mon..7=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - (isoDay - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: formatLocalDate(monday), end: formatLocalDate(sunday) };
}

// Calendar month containing today — not called out explicitly by D-022 (only
// daily/weekly examples are specified), but follows the same "target
// frequency follows item frequency" rule for monthly tracked items.
export function currentMonthRange(): { start: string; end: string } {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { start: formatLocalDate(first), end: formatLocalDate(last) };
}

export function periodRangeForFrequency(frequency: Frequency): { start: string; end: string } {
  if (frequency === 'weekly') return currentWeekRange();
  if (frequency === 'monthly') return currentMonthRange();
  const today = localToday();
  return { start: today, end: today };
}

export async function getEntriesForPeriod(
  checklistItemId: string,
  start: string,
  end: string,
): Promise<RecurringEntry[]> {
  const { data, error } = await supabase
    .from('recurring_entries')
    .select('*')
    .eq('checklist_item_id', checklistItemId)
    .gte('logged_at', startOfLocalDay(start).toISOString())
    .lte('logged_at', endOfLocalDay(end).toISOString())
    .order('logged_at', { ascending: false });
  if (error) throw error;
  return data as RecurringEntry[];
}

export async function getEntriesToday(checklistItemId: string): Promise<RecurringEntry[]> {
  const today = localToday();
  return getEntriesForPeriod(checklistItemId, today, today);
}

export async function getEntriesThisWeek(checklistItemId: string): Promise<RecurringEntry[]> {
  const { start, end } = currentWeekRange();
  return getEntriesForPeriod(checklistItemId, start, end);
}

export async function getEntryCount(
  checklistItemId: string,
  periodStart: string,
  periodEnd: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('recurring_entries')
    .select('id', { count: 'exact', head: true })
    .eq('checklist_item_id', checklistItemId)
    .gte('logged_at', startOfLocalDay(periodStart).toISOString())
    .lte('logged_at', endOfLocalDay(periodEnd).toISOString());
  if (error) throw error;
  return count ?? 0;
}

// Recalculates the current period's entry count against the item's tracking
// target and mirrors the result into checklist_completions (insert on
// reaching target, remove on dropping below) — the only place auto-complete
// is decided. No-ops if the item has no entry_config.
async function recalculateAndSync(checklistItemId: string): Promise<void> {
  const { data: itemData, error: itemError } = await supabase
    .from('checklist_items')
    .select('frequency')
    .eq('id', checklistItemId)
    .single();
  if (itemError) throw itemError;
  const frequency = (itemData as { frequency: Frequency }).frequency;

  const { data: configData, error: configError } = await supabase
    .from('entry_configs')
    .select('target')
    .eq('checklist_item_id', checklistItemId)
    .maybeSingle();
  if (configError) throw configError;
  if (!configData) return;
  const target = (configData as { target: number }).target;

  const { start, end } = periodRangeForFrequency(frequency);
  const count = await getEntryCount(checklistItemId, start, end);
  await setCompletedToday(checklistItemId, count >= target);
}

export async function logEntry(
  checklistItemId: string,
  entryLabelId?: string,
  value?: number,
  note?: string,
): Promise<RecurringEntry> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('recurring_entries')
    .insert({
      checklist_item_id: checklistItemId,
      entry_label_id: entryLabelId ?? null,
      user_id: userData.user.id,
      value: value ?? null,
      note: note ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  await recalculateAndSync(checklistItemId);
  return data as RecurringEntry;
}

export async function deleteEntry(entryId: string): Promise<void> {
  const { data, error } = await supabase
    .from('recurring_entries')
    .select('checklist_item_id')
    .eq('id', entryId)
    .single();
  if (error) throw error;
  const checklistItemId = (data as { checklist_item_id: string }).checklist_item_id;

  const { error: deleteError } = await supabase.from('recurring_entries').delete().eq('id', entryId);
  if (deleteError) throw deleteError;

  await recalculateAndSync(checklistItemId);
}
