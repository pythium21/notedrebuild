import { supabase } from './supabaseClient';

// Calendar Phase 1 (DECISIONS.md D-019) — real appointments/events, fully
// separate from tasks (which keep their single nullable `date`).

export interface CalendarEvent {
  id: string;
  user_id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  all_day: boolean;
  location: string | null;
  description: string | null;
  source: string;
  created_at: string;
}

export interface EventInput {
  title: string;
  start_time: string;
  end_time?: string | null;
  all_day?: boolean;
  location?: string | null;
  description?: string | null;
}

// [startISO, endISOExclusive) — matches how the calendar UI fetches one
// visible month at a time.
export async function listEventsInRange(
  startISO: string,
  endISOExclusive: string,
): Promise<CalendarEvent[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .gte('start_time', startISO)
    .lt('start_time', endISOExclusive)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return data as CalendarEvent[];
}

export async function createEvent(input: EventInput): Promise<CalendarEvent> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('events')
    .insert({
      user_id: userData.user.id,
      title: input.title,
      start_time: input.start_time,
      end_time: input.end_time || null,
      all_day: input.all_day || false,
      location: input.location || null,
      description: input.description || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CalendarEvent;
}

export async function updateEvent(id: string, input: EventInput): Promise<CalendarEvent> {
  const { data, error } = await supabase
    .from('events')
    .update({
      title: input.title,
      start_time: input.start_time,
      end_time: input.end_time || null,
      all_day: input.all_day || false,
      location: input.location || null,
      description: input.description || null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as CalendarEvent;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}
