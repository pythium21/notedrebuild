'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  archiveChecklistItem,
  createChecklistItem,
  listChecklistForToday,
  setChecklistItemSortOrder,
  setCompletedToday,
  updateChecklistItemTitle,
  type ChecklistItemToday,
} from '@/lib/checklist';

// Standalone data hook — no shared queries with tasks. The component (and this
// hook) can be relocated to Dashboard or Today by moving the render call only.
function useDailyChecklist() {
  const [items, setItems] = useState<ChecklistItemToday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    return listChecklistForToday()
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  return { items, setItems, loading, error, setError, reload };
}

export function DailyChecklist() {
  const { items, setItems, loading, error, setError, reload } = useDailyChecklist();
  const [newTitle, setNewTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || isAdding) return;
    setError(null);
    setIsAdding(true);
    try {
      const nextSort = items.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
      const item = await createChecklistItem(newTitle.trim(), nextSort);
      setItems((prev) => [...prev, { ...item, completedToday: false }]);
      setNewTitle('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAdding(false);
    }
  }

  async function handleToggle(item: ChecklistItemToday) {
    const next = !item.completedToday;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, completedToday: next } : i)),
    );
    try {
      await setCompletedToday(item.id, next);
    } catch (e) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, completedToday: item.completedToday } : i)),
      );
      setError((e as Error).message);
    }
  }

  function handleEditStart(item: ChecklistItemToday) {
    setEditingId(item.id);
    setEditTitle(item.title);
  }

  async function handleEditSave(e: FormEvent, item: ChecklistItemToday) {
    e.preventDefault();
    if (!editTitle.trim() || isSaving) return;
    setError(null);
    setIsSaving(true);
    try {
      await updateChecklistItemTitle(item.id, editTitle.trim());
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, title: editTitle.trim() } : i)),
      );
      setEditingId(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  // Move by rewriting sort_order = index for every row whose position changed —
  // self-heals rows that share a sort_order (e.g. several created at default 0).
  async function handleMove(item: ChecklistItemToday, direction: -1 | 1) {
    const index = items.findIndex((i) => i.id === item.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;

    const reordered = [...items];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const renumbered = reordered.map((i, idx) => ({ ...i, sort_order: idx }));
    setItems(renumbered);
    try {
      await Promise.all(
        renumbered
          .filter((i, idx) => items[idx].id !== i.id || items[idx].sort_order !== i.sort_order)
          .map((i) => setChecklistItemSortOrder(i.id, i.sort_order)),
      );
    } catch (e) {
      setError((e as Error).message);
      await reload();
    }
  }

  async function handleArchive(item: ChecklistItemToday) {
    if (archivingId) return;
    if (!window.confirm(`Archive "${item.title}"? Its completion history is kept.`)) return;
    setError(null);
    setArchivingId(item.id);
    try {
      await archiveChecklistItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <section className="daily-checklist">
      <h2 className="daily-checklist__title">Daily Checklist</h2>
      <p className="daily-checklist__hint">Recurring habits — resets every day at local midnight.</p>

      <form className="add-form" onSubmit={handleAdd}>
        <input
          type="text"
          className="add-form__name"
          placeholder="Add a daily item…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />
        <button type="submit" className="add-form__submit" disabled={isAdding}>
          {isAdding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}

      {loading ? null : items.length === 0 ? (
        <p className="list-empty">No daily items yet — add one above.</p>
      ) : (
        <div className="list">
          {items.map((item, index) =>
            editingId === item.id ? (
              <form
                key={item.id}
                className="item item-edit-form"
                onSubmit={(e) => handleEditSave(e, item)}
              >
                <input
                  type="text"
                  className="item-edit-form__name"
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
                <button type="submit" className="item-edit-form__save" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className="item-edit-form__cancel"
                  onClick={() => setEditingId(null)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </form>
            ) : (
              <div
                key={item.id}
                className={`item item--task${item.completedToday ? ' is-done' : ''}`}
              >
                <label className="item__main">
                  <input
                    type="checkbox"
                    checked={item.completedToday}
                    onChange={() => handleToggle(item)}
                  />
                  <span className="item__name">{item.title}</span>
                </label>
                <div className="item__actions">
                  <button
                    type="button"
                    className="item__action"
                    onClick={() => handleMove(item, -1)}
                    disabled={index === 0}
                    title="Move up"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="item__action"
                    onClick={() => handleMove(item, 1)}
                    disabled={index === items.length - 1}
                    title="Move down"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="item__action"
                    onClick={() => handleEditStart(item)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="item__action item__action--danger"
                    onClick={() => handleArchive(item)}
                    disabled={archivingId === item.id}
                  >
                    {archivingId === item.id ? 'Archiving…' : 'Archive'}
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}
