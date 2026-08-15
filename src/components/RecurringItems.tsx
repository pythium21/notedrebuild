'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  archiveChecklistItem,
  createChecklistItem,
  getCompletionRate,
  getStreak,
  listRecurringForToday,
  setChecklistItemSortOrder,
  setCompletedToday,
  updateChecklistItemTitle,
  type ChecklistItemToday,
  type Frequency,
} from '@/lib/checklist';

const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function currentQuarterRange(): { start: string; end: string } {
  const now = new Date();
  const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
  return {
    start: toLocalDateString(new Date(now.getFullYear(), quarterStartMonth, 1)),
    end: toLocalDateString(now),
  };
}

function formatFrequency(item: ChecklistItemToday): string {
  if (item.frequency === 'daily') return 'Daily';
  if (item.frequency === 'weekly') {
    const days = (item.days_of_week || [])
      .map((d) => WEEKDAYS.find((w) => w.value === d)?.label)
      .filter(Boolean)
      .join(', ');
    return `Weekly — ${days || 'no days set'}`;
  }
  return `Monthly — day ${item.day_of_month ?? '–'}`;
}

function formatCreatedDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Standalone data hook — no shared queries with tasks.
function useRecurringItems() {
  const [items, setItems] = useState<ChecklistItemToday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    return listRecurringForToday()
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, [reload]);

  return { items, setItems, loading, error, setError, reload };
}

export function RecurringItems() {
  const { items, setItems, loading, error, setError, reload } = useRecurringItems();
  const [progress, setProgress] = useState<Record<string, string>>({});

  const [newTitle, setNewTitle] = useState('');
  const [newFrequency, setNewFrequency] = useState<Frequency | null>(null);
  const [newDaysOfWeek, setNewDaysOfWeek] = useState<number[]>([]);
  const [newDayOfMonth, setNewDayOfMonth] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    Promise.all(
      items.map(async (item): Promise<[string, string]> => {
        try {
          if (item.frequency === 'daily') {
            const streak = await getStreak(item.id);
            return [item.id, `${streak} day streak`];
          }
          const { start, end } = currentQuarterRange();
          const { done, due } = await getCompletionRate(item.id, start, end);
          return [item.id, `${done}/${due} this quarter`];
        } catch {
          return [item.id, ''];
        }
      }),
    ).then((entries) => {
      if (!cancelled) setProgress(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const dayOfMonthNum = Number(newDayOfMonth);
  const canSubmit =
    newTitle.trim().length > 0 &&
    newFrequency !== null &&
    (newFrequency !== 'weekly' || newDaysOfWeek.length > 0) &&
    (newFrequency !== 'monthly' ||
      (newDayOfMonth.trim().length > 0 && dayOfMonthNum >= 1 && dayOfMonthNum <= 31));

  function resetAddForm() {
    setNewTitle('');
    setNewFrequency(null);
    setNewDaysOfWeek([]);
    setNewDayOfMonth('');
  }

  function toggleNewDayOfWeek(value: number) {
    setNewDaysOfWeek((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value].sort(),
    );
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || isAdding) return;
    setError(null);
    setIsAdding(true);
    try {
      const nextSort = items.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
      const item = await createChecklistItem(
        newTitle.trim(),
        nextSort,
        newFrequency as Frequency,
        newDaysOfWeek,
        newFrequency === 'monthly' ? dayOfMonthNum : undefined,
      );
      setItems((prev) => [...prev, { ...item, completedToday: false }]);
      resetAddForm();
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

  function handleToggleExpand(itemId: string) {
    setExpandedId((prev) => (prev === itemId ? null : itemId));
  }

  return (
    <div>
      <p className="page-hint">
        Items on a fixed schedule — daily, weekly, or monthly. Not a task list.
      </p>

      <form className="recurring-add-form" onSubmit={handleAdd}>
        <input
          type="text"
          className="add-form__name"
          placeholder="Add a recurring item…"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
        />

        <div className="frequency-chips" role="group" aria-label="Frequency">
          {(['daily', 'weekly', 'monthly'] as Frequency[]).map((freq) => (
            <button
              key={freq}
              type="button"
              className={`chip${newFrequency === freq ? ' is-selected' : ''}`}
              onClick={() => setNewFrequency(freq)}
            >
              {freq[0].toUpperCase() + freq.slice(1)}
            </button>
          ))}
        </div>

        {newFrequency === 'weekly' && (
          <div className="weekday-chips" role="group" aria-label="Days of week">
            {WEEKDAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                className={`chip chip--sm${newDaysOfWeek.includes(day.value) ? ' is-selected' : ''}`}
                onClick={() => toggleNewDayOfWeek(day.value)}
              >
                {day.label}
              </button>
            ))}
          </div>
        )}

        {newFrequency === 'monthly' && (
          <input
            type="number"
            min={1}
            max={31}
            className="month-day-input"
            placeholder="Day of month (1–31)"
            value={newDayOfMonth}
            onChange={(e) => setNewDayOfMonth(e.target.value)}
          />
        )}

        <button type="submit" className="add-form__submit" disabled={!canSubmit || isAdding}>
          {isAdding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}

      {loading ? null : items.length === 0 ? (
        <p className="list-empty">No recurring items yet — add one above.</p>
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
              <div key={item.id}>
                <div
                  className={`item item--task${item.completedToday ? ' is-done' : ''}${expandedId === item.id ? ' is-expanded' : ''}`}
                  onClick={() => handleToggleExpand(item.id)}
                >
                  <label className="item__main" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={item.completedToday}
                      onChange={() => handleToggle(item)}
                    />
                    <span className="item__text">
                      <span className="item__name">{item.title}</span>
                      {progress[item.id] && (
                        <span className="item__progress">{progress[item.id]}</span>
                      )}
                    </span>
                  </label>
                  <div className="item__actions" onClick={(e) => e.stopPropagation()}>
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
                  </div>
                </div>
                <div className={`item-accordion${expandedId === item.id ? ' is-open' : ''}`}>
                  <div className="item-accordion__body">
                    <div className="item-accordion__row">
                      <span className="item-accordion__row-label">Frequency</span>
                      <span>{formatFrequency(item)}</span>
                    </div>
                    <div className="item-accordion__row">
                      <span className="item-accordion__row-label">
                        {item.frequency === 'daily' ? 'Streak' : 'Completion rate'}
                      </span>
                      <span>{progress[item.id] || '–'}</span>
                    </div>
                    <div className="item-accordion__row">
                      <span className="item-accordion__row-label">Created</span>
                      <span>{formatCreatedDate(item.created_at)}</span>
                    </div>
                    <div className="item-accordion__actions">
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
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
