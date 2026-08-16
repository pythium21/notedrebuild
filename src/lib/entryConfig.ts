import { supabase } from './supabaseClient';
import type { EntryLabel } from './entryLabels';

// Entry Tracking — sub-tracking config for a recurring item (DECISIONS.md
// D-022). One config per checklist_item (UNIQUE constraint), always with a
// mandatory numeric target. Auto-completion lives in recurringEntries.ts,
// which is what actually reads/writes checklist_completions.

export type EntryType = 'counter' | 'checklist' | 'numeric';

export interface EntryConfig {
  id: string;
  checklist_item_id: string;
  user_id: string;
  type: EntryType;
  target: number;
  created_at: string;
}

export interface EntryConfigWithLabels extends EntryConfig {
  entry_labels: EntryLabel[];
}

function withSortedLabels(
  row: EntryConfig & { entry_labels: EntryLabel[] | null },
): EntryConfigWithLabels {
  const { entry_labels, ...config } = row;
  return { ...config, entry_labels: (entry_labels || []).sort((a, b) => a.sort_order - b.sort_order) };
}

export async function getEntryConfig(checklistItemId: string): Promise<EntryConfigWithLabels | null> {
  const { data, error } = await supabase
    .from('entry_configs')
    .select('*, entry_labels(*)')
    .eq('checklist_item_id', checklistItemId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return withSortedLabels(data as EntryConfig & { entry_labels: EntryLabel[] | null });
}

// Batch fetch for a list view — one query instead of N.
export async function getEntryConfigsForItems(
  checklistItemIds: string[],
): Promise<Record<string, EntryConfigWithLabels>> {
  if (checklistItemIds.length === 0) return {};
  const { data, error } = await supabase
    .from('entry_configs')
    .select('*, entry_labels(*)')
    .in('checklist_item_id', checklistItemIds);
  if (error) throw error;
  const result: Record<string, EntryConfigWithLabels> = {};
  for (const row of data as (EntryConfig & { entry_labels: EntryLabel[] | null })[]) {
    const config = withSortedLabels(row);
    result[config.checklist_item_id] = config;
  }
  return result;
}

export async function createEntryConfig(
  checklistItemId: string,
  type: EntryType,
  target: number,
  labels: { name: string; default_value?: number; unit?: string }[],
): Promise<EntryConfigWithLabels> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data: configData, error } = await supabase
    .from('entry_configs')
    .insert({ checklist_item_id: checklistItemId, user_id: userData.user.id, type, target })
    .select()
    .single();
  if (error) throw error;
  const config = configData as EntryConfig;

  if (labels.length === 0) return { ...config, entry_labels: [] };

  const { data: labelRows, error: labelError } = await supabase
    .from('entry_labels')
    .insert(
      labels.map((label, index) => ({
        entry_config_id: config.id,
        name: label.name,
        default_value: label.default_value ?? null,
        unit: label.unit ?? null,
        sort_order: index,
      })),
    )
    .select();
  if (labelError) throw labelError;

  return { ...config, entry_labels: labelRows as EntryLabel[] };
}

export async function updateEntryConfig(
  configId: string,
  updates: Partial<Pick<EntryConfig, 'type' | 'target'>>,
): Promise<void> {
  const { error } = await supabase.from('entry_configs').update(updates).eq('id', configId);
  if (error) throw error;
}

// Cascades to entry_labels and recurring_entries via their FKs (SCHEMA.md).
export async function deleteEntryConfig(configId: string): Promise<void> {
  const { error } = await supabase.from('entry_configs').delete().eq('id', configId);
  if (error) throw error;
}
