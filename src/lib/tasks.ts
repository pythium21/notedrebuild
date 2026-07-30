import { supabase } from './supabaseClient';

export interface Task {
  id: string;
  user_id: string;
  name: string;
  tag: string | null;
  done: boolean;
  date: string | null;
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
