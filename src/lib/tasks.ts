import { supabase } from './supabaseClient';

export interface Task {
  id: string;
  user_id: string;
  name: string;
  tag: string | null;
  done: boolean;
  date: string | null;
  flagged_today: boolean;
  created_at: string;
}

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Task[];
}

export async function listFlaggedTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('flagged_today', true)
    .eq('done', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as Task[];
}

export async function createTask(input: {
  name: string;
  tag?: string | null;
  date?: string | null;
}): Promise<Task> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      user_id: userData.user.id,
      name: input.name,
      tag: input.tag || null,
      date: input.date || null,
      done: false,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function setTaskDone(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('tasks').update({ done }).eq('id', id);
  if (error) throw error;
}

export async function setTaskFlaggedToday(id: string, flagged: boolean): Promise<void> {
  const { error } = await supabase.from('tasks').update({ flagged_today: flagged }).eq('id', id);
  if (error) throw error;
}

export async function updateTask(
  id: string,
  input: { name: string; tag?: string | null; date?: string | null }
): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update({
      name: input.name,
      tag: input.tag || null,
      date: input.date || null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}
