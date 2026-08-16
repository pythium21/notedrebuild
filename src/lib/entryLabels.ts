import { supabase } from './supabaseClient';

// Entry Tracking — labels belong to an entry_config (DECISIONS.md D-022).
// Each label is one loggable thing: a counter chip ("Cup"), a checklist item
// ("Vitamin D"), or the unit descriptor for a numeric config ("steps").

export interface EntryLabel {
  id: string;
  entry_config_id: string;
  name: string;
  default_value: number | null;
  unit: string | null;
  sort_order: number;
  created_at: string;
}

export async function getLabelsForConfig(configId: string): Promise<EntryLabel[]> {
  const { data, error } = await supabase
    .from('entry_labels')
    .select('*')
    .eq('entry_config_id', configId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data as EntryLabel[];
}

export async function addLabel(
  configId: string,
  name: string,
  defaultValue?: number,
  unit?: string,
  sortOrder?: number,
): Promise<EntryLabel> {
  const { data, error } = await supabase
    .from('entry_labels')
    .insert({
      entry_config_id: configId,
      name,
      default_value: defaultValue ?? null,
      unit: unit ?? null,
      sort_order: sortOrder ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  return data as EntryLabel;
}

export async function updateLabel(
  labelId: string,
  updates: Partial<Pick<EntryLabel, 'name' | 'default_value' | 'unit' | 'sort_order'>>,
): Promise<void> {
  const { error } = await supabase.from('entry_labels').update(updates).eq('id', labelId);
  if (error) throw error;
}

export async function removeLabel(labelId: string): Promise<void> {
  const { error } = await supabase.from('entry_labels').delete().eq('id', labelId);
  if (error) throw error;
}
