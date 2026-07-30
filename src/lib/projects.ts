import { supabase } from './supabaseClient';

export type ProjectStatus = 'Planning' | 'In progress' | 'Done';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  steps: string | null;
  status: ProjectStatus;
  created_at: string;
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Project[];
}

export async function createProject(input: {
  name: string;
  steps?: string | null;
  status?: ProjectStatus;
}): Promise<Project> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: userData.user.id,
      name: input.name,
      steps: input.steps || null,
      status: input.status || 'Planning',
    })
    .select()
    .single();
  if (error) throw error;
  return data as Project;
}

export async function setProjectStatus(id: string, status: ProjectStatus): Promise<void> {
  const { error } = await supabase.from('projects').update({ status }).eq('id', id);
  if (error) throw error;
}
