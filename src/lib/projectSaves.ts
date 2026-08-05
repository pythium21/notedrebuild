import type { Save } from './saves';
import { supabase } from './supabaseClient';

export interface ProjectSave {
  id: string;
  project_id: string;
  save_id: string;
  action_id: string | null;
  created_at: string;
}

export interface ProjectSaveWithSave extends ProjectSave {
  save: Save;
}

// Saves attached at the project level (action_id null).
export async function listSavesForProject(projectId: string): Promise<ProjectSaveWithSave[]> {
  const { data, error } = await supabase
    .from('project_saves')
    .select('*, save:saves(*)')
    .eq('project_id', projectId)
    .is('action_id', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as ProjectSaveWithSave[];
}

// Saves attached to one specific action.
export async function listSavesForAction(actionId: string): Promise<ProjectSaveWithSave[]> {
  const { data, error } = await supabase
    .from('project_saves')
    .select('*, save:saves(*)')
    .eq('action_id', actionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as ProjectSaveWithSave[];
}

export async function attachSave(input: {
  project_id: string;
  save_id: string;
  action_id?: string | null;
}): Promise<ProjectSave> {
  const { data, error } = await supabase
    .from('project_saves')
    .insert({
      project_id: input.project_id,
      save_id: input.save_id,
      action_id: input.action_id || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as ProjectSave;
}

export async function removeProjectSave(id: string): Promise<void> {
  const { error } = await supabase.from('project_saves').delete().eq('id', id);
  if (error) throw error;
}
