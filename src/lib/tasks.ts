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
  archived: boolean;
  archived_at: string | null;
}

export async function listTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('archived', false)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Task[];
}

// Archived tasks (DECISIONS.md D-021) — completed tasks tucked out of the
// active list but kept as history, not deleted. Ordered by archived_at so
// the most recently completed shows first.
export async function listArchivedTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('archived', true)
    .order('archived_at', { ascending: false });
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

export async function listUpcomingTasks(): Promise<Task[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('done', false)
    .eq('flagged_today', false)
    .not('date', 'is', null)
    .gte('date', today)
    .order('date', { ascending: true });
  if (error) throw error;
  return data as Task[];
}

// Inclusive [startDate, endDate] on tasks.date — feeds the Calendar tab
// (DECISIONS.md D-019), which surfaces task due dates read-only alongside
// events.
export async function listTasksInRange(startDate: string, endDate: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('archived', false)
    .not('date', 'is', null)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });
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

// Soft-delete, alongside the hard Delete above (DECISIONS.md D-021) — keeps
// the row as history instead of removing it. archived_at is stamped
// client-side, matching pages.ts's updated_at convention (no DB trigger).
export async function archiveTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ archived: true, archived_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function unarchiveTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('tasks')
    .update({ archived: false, archived_at: null })
    .eq('id', id);
  if (error) throw error;
}
