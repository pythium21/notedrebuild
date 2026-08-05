import { listActionsForProject } from './actions';
import { supabase } from './supabaseClient';

export type ProjectStatus = 'active' | 'on_hold' | 'done' | 'archived';
export type ProjectPriority = 'high' | 'medium' | 'low';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  status: ProjectStatus | null;
  priority: ProjectPriority | null;
  description: string | null;
  due_date: string | null;
  tags: string[] | null;
  parent_id: string | null;
  outcome: string | null;
  page_id: string | null;
  created_at: string;
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .is('parent_id', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Project[];
}

// Flat list of every project regardless of nesting — used by pickers (e.g.
// "Link to project" from Save Manager) where sub-projects should also be
// selectable, unlike the root-only card grid.
export async function listAllProjects(): Promise<Project[]> {
  const { data, error } = await supabase.from('projects').select('*').order('name', { ascending: true });
  if (error) throw error;
  return data as Project[];
}

export async function getProject(id: string): Promise<Project> {
  const { data, error } = await supabase.from('projects').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Project;
}

export async function listChildProjects(parentId: string): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('parent_id', parentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Project[];
}

export async function createProject(input: { name: string; parent_id?: string | null }): Promise<Project> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: userData.user.id,
      name: input.name,
      parent_id: input.parent_id || null,
      status: null,
      priority: null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Project;
}

export async function updateProject(
  id: string,
  input: Partial<{
    name: string;
    status: ProjectStatus | null;
    priority: ProjectPriority | null;
    description: string | null;
    due_date: string | null;
    tags: string[] | null;
    parent_id: string | null;
    outcome: string | null;
    page_id: string | null;
  }>
): Promise<Project> {
  const { data, error } = await supabase.from('projects').update(input).eq('id', id).select().single();
  if (error) throw error;
  return data as Project;
}

export interface ProjectProgress {
  completed: number;
  total: number;
}

export async function computeProjectProgress(projectId: string): Promise<ProjectProgress> {
  const [actions, children] = await Promise.all([
    listActionsForProject(projectId),
    listChildProjects(projectId),
  ]);

  let completed = actions.filter((a) => a.completed).length;
  let total = actions.length;

  const childProgress = await Promise.all(children.map((child) => computeProjectProgress(child.id)));
  for (const progress of childProgress) {
    completed += progress.completed;
    total += progress.total;
  }

  return { completed, total };
}
