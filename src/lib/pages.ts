import { supabase } from './supabaseClient';

export type BlockType = 'text' | 'heading' | 'checklist' | 'bullet' | 'page_link';

export interface Block {
  id: string;
  type: BlockType;
  text?: string;
  checked?: boolean;
  pageId?: string; // page_link blocks only — the child page this block links to
}

export interface Page {
  id: string;
  user_id: string;
  title: string;
  emoji: string | null;
  parent_id: string | null;
  content: Block[];
  created_at: string;
  updated_at: string;
}

export function newBlockId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `blk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emptyTextBlock(): Block {
  return { id: newBlockId(), type: 'text', text: '' };
}

export async function listPages(): Promise<Page[]> {
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .order('title', { ascending: true });
  if (error) throw error;
  return data as Page[];
}

export async function listChildPages(parentId: string): Promise<Page[]> {
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('parent_id', parentId)
    .order('title', { ascending: true });
  if (error) throw error;
  return data as Page[];
}

export async function getPage(id: string): Promise<Page> {
  const { data, error } = await supabase.from('pages').select('*').eq('id', id).single();
  if (error) throw error;
  return data as Page;
}

export async function createPage(input: {
  title?: string;
  parent_id?: string | null;
}): Promise<Page> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('pages')
    .insert({
      user_id: userData.user.id,
      title: input.title?.trim() || 'Untitled',
      parent_id: input.parent_id || null,
      content: [],
    })
    .select()
    .single();
  if (error) throw error;
  return data as Page;
}

// Creates a child page row only — does not touch the parent's content.
// Callers that need a page_link block inserted into the currently-open
// parent editor (the slash-command "Sub-page" flow) do that themselves,
// after flushing any pending debounced save on the parent. See PageEditor.
export async function createSubPage(parentId: string, title?: string): Promise<Page> {
  return createPage({ title: title || 'Untitled', parent_id: parentId });
}

export async function updatePage(
  id: string,
  input: Partial<{ title: string; emoji: string | null; content: Block[]; parent_id: string | null }>
): Promise<Page> {
  const { data, error } = await supabase
    .from('pages')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Page;
}

export async function deletePage(id: string): Promise<void> {
  const children = await listChildPages(id);
  if (children.length > 0) {
    throw new Error(
      `This page has ${children.length} sub-page${children.length === 1 ? '' : 's'} — move or delete them first.`
    );
  }

  const { error } = await supabase.from('pages').delete().eq('id', id);
  if (error) {
    if (error.code === '23503') {
      throw new Error('This page still has sub-pages — move or delete them first.');
    }
    throw error;
  }
}
