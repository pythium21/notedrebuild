import { createTask, type Task } from './tasks';
import { supabase } from './supabaseClient';

export interface Action {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  completed: boolean;
  flagged_today: boolean;
  linked_task_id: string | null;
  due_date: string | null;
  created_at: string;
}

export interface FlaggedAction extends Action {
  project: { name: string } | null;
}

export interface UpcomingAction extends Action {
  project: { name: string } | null;
}

export async function listActionsForProject(projectId: string): Promise<Action[]> {
  const { data, error } = await supabase
    .from('actions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Action[];
}

export async function listFlaggedActions(): Promise<FlaggedAction[]> {
  const { data, error } = await supabase
    .from('actions')
    .select('*, project:projects(name)')
    .eq('flagged_today', true)
    .eq('completed', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as unknown as FlaggedAction[];
}

export async function listUpcomingActions(): Promise<UpcomingAction[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('actions')
    .select('*, project:projects(name)')
    .eq('completed', false)
    .eq('flagged_today', false)
    .not('due_date', 'is', null)
    .gte('due_date', today)
    .order('due_date', { ascending: true });
  if (error) throw error;
  return data as unknown as UpcomingAction[];
}

export async function getActionByLinkedTaskId(taskId: string): Promise<Action | null> {
  const { data, error } = await supabase
    .from('actions')
    .select('*')
    .eq('linked_task_id', taskId)
    .maybeSingle();
  if (error) throw error;
  return data as Action | null;
}

export async function createAction(projectId: string, title: string): Promise<Action> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('actions')
    .insert({
      user_id: userData.user.id,
      project_id: projectId,
      title,
      completed: false,
      flagged_today: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Action;
}

export async function setActionCompleted(id: string, completed: boolean): Promise<void> {
  const { error } = await supabase.from('actions').update({ completed }).eq('id', id);
  if (error) throw error;
}

export async function setActionFlaggedToday(id: string, flagged: boolean): Promise<void> {
  const { error } = await supabase.from('actions').update({ flagged_today: flagged }).eq('id', id);
  if (error) throw error;
}

export async function convertActionToTask(action: Action): Promise<{ action: Action; task: Task }> {
  const task = await createTask({ name: action.title });

  const { data, error } = await supabase
    .from('actions')
    .update({ linked_task_id: task.id })
    .eq('id', action.id)
    .select()
    .single();
  if (error) throw error;
  return { action: data as Action, task };
}
