'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  archiveChecklistItem,
  createChecklistItem,
  deleteChecklistItem,
  getCompletionRate,
  getStreak,
  listRecurringForToday,
  setChecklistItemSortOrder,
  setCompletedToday,
  updateChecklistItemTitle,
  type ChecklistItemToday,
  type Frequency,
} from '@/lib/checklist';
import {
  createEntryConfig,
  deleteEntryConfig,
  getEntryConfigsForItems,
  updateEntryConfig,
  type EntryConfigWithLabels,
  type EntryType,
} from '@/lib/entryConfig';
import { addLabel, removeLabel, updateLabel } from '@/lib/entryLabels';
import { getEntryCount, periodRangeForFrequency } from '@/lib/recurringEntries';
import { RecurringDetailPanel } from '@/components/RecurringDetailPanel';
import { RecurringItemRow } from '@/components/RecurringItemRow';
import { TrackingConfigFields, isTrackingValid, type TrackingLabelDraft } from '@/components/TrackingConfigFields';

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

  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [trackingType, setTrackingType] = useState<EntryType>('counter');
  const [trackingTarget, setTrackingTarget] = useState('');
  const [trackingLabels, setTrackingLabels] = useState<TrackingLabelDraft[]>([
    { name: '', defaultValue: '', unit: '' },
  ]);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTrackingEnabled, setEditTrackingEnabled] = useState(false);
  const [editTrackingType, setEditTrackingType] = useState<EntryType>('counter');
  const [editTrackingTarget, setEditTrackingTarget] = useState('');
  const [editTrackingLabels, setEditTrackingLabels] = useState<TrackingLabelDraft[]>([
    { name: '', defaultValue: '', unit: '' },
  ]);
  const [editAttemptedSubmit, setEditAttemptedSubmit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [entryConfigs, setEntryConfigs] = useState<Record<string, EntryConfigWithLabels>>({});
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});

  // Batch-loads tracking configs + current-period counts whenever the item
  // list changes (DECISIONS.md D-022) — untracked items just don't appear
  // in either map.
  useEffect(() => {
    if (items.length === 0) {
      setEntryConfigs({});
      setEntryCounts({});
      return;
    }
    let cancelled = false;
    getEntryConfigsForItems(items.map((i) => i.id))
      .then(async (configs) => {
        if (cancelled) return;
        setEntryConfigs(configs);
        const counts: Record<string, number> = {};
        await Promise.all(
          Object.values(configs).map(async (config) => {
            const item = items.find((i) => i.id === config.checklist_item_id);
            if (!item) return;
            const { start, end } = periodRangeForFrequency(item.frequency);
            try {
              counts[config.checklist_item_id] = await getEntryCount(
                config.checklist_item_id,
                start,
                end,
              );
            } catch {
              counts[config.checklist_item_id] = 0;
            }
          }),
        );
        if (!cancelled) setEntryCounts(counts);
      })
      .catch((e) => setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [items, setError]);

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
  const trackingTargetNum = Number(trackingTarget);
  const trackingValid = !trackingEnabled || isTrackingValid(trackingTarget, trackingLabels);
  const canSubmit =
    newTitle.trim().length > 0 &&
    newFrequency !== null &&
    (newFrequency !== 'weekly' || newDaysOfWeek.length > 0) &&
    (newFrequency !== 'monthly' ||
      (newDayOfMonth.trim().length > 0 && dayOfMonthNum >= 1 && dayOfMonthNum <= 31)) &&
    trackingValid;

  function resetAddForm() {
    setNewTitle('');
    setNewFrequency(null);
    setNewDaysOfWeek([]);
    setNewDayOfMonth('');
    setTrackingEnabled(false);
    setTrackingType('counter');
    setTrackingTarget('');
    setTrackingLabels([{ name: '', defaultValue: '', unit: '' }]);
    setAttemptedSubmit(false);
  }

  function toggleNewDayOfWeek(value: number) {
    setNewDaysOfWeek((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value].sort(),
    );
  }

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAttemptedSubmit(true);
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
      if (trackingEnabled) {
        const config = await createEntryConfig(
          item.id,
          trackingType,
          trackingTargetNum,
          trackingLabels
            .filter((l) => l.name.trim().length > 0)
            .map((l) => ({
              name: l.name.trim(),
              default_value: l.defaultValue.trim() ? Number(l.defaultValue) : undefined,
              unit: l.unit.trim() || undefined,
            })),
        );
        setEntryConfigs((prev) => ({ ...prev, [item.id]: config }));
        setEntryCounts((prev) => ({ ...prev, [item.id]: 0 }));
      }
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

  // Edit offers "Add tracking" for an item that isn't tracked yet, or shows
  // the current config (type/target/labels) pre-filled for one that already
  // is — retroactive tracking config editing (DECISIONS.md D-023).
  function handleEditStart(item: ChecklistItemToday) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditAttemptedSubmit(false);
    const config = entryConfigs[item.id];
    if (config) {
      setEditTrackingEnabled(true);
      setEditTrackingType(config.type);
      setEditTrackingTarget(String(config.target));
      setEditTrackingLabels(
        config.entry_labels.length > 0
          ? config.entry_labels.map((l) => ({
              id: l.id,
              name: l.name,
              defaultValue: l.default_value != null ? String(l.default_value) : '',
              unit: l.unit || '',
            }))
          : [{ name: '', defaultValue: '', unit: '' }],
      );
    } else {
      setEditTrackingEnabled(false);
      setEditTrackingType('counter');
      setEditTrackingTarget('');
      setEditTrackingLabels([{ name: '', defaultValue: '', unit: '' }]);
    }
  }

  async function handleEditSave(e: FormEvent, item: ChecklistItemToday) {
    e.preventDefault();
    setEditAttemptedSubmit(true);
    const trackingOk = !editTrackingEnabled || isTrackingValid(editTrackingTarget, editTrackingLabels);
    if (!editTitle.trim() || !trackingOk || isSaving) return;

    const config = entryConfigs[item.id];
    if (!editTrackingEnabled && config) {
      if (!window.confirm('Remove tracking from this item? Its logged entries will be deleted.')) {
        return;
      }
    }

    setError(null);
    setIsSaving(true);
    try {
      await updateChecklistItemTitle(item.id, editTitle.trim());

      if (editTrackingEnabled) {
        const targetNum = Number(editTrackingTarget);
        const cleanLabels = editTrackingLabels.filter((l) => l.name.trim().length > 0);
        if (config) {
          if (config.type !== editTrackingType || config.target !== targetNum) {
            await updateEntryConfig(config.id, { type: editTrackingType, target: targetNum });
          }
          const survivingIds = new Set(cleanLabels.filter((l) => l.id).map((l) => l.id));
          await Promise.all(
            config.entry_labels
              .filter((l) => !survivingIds.has(l.id))
              .map((l) => removeLabel(l.id)),
          );
          await Promise.all(
            cleanLabels.map((l, index) => {
              const defaultValue = l.defaultValue.trim() ? Number(l.defaultValue) : undefined;
              const unit = l.unit.trim() || undefined;
              return l.id
                ? updateLabel(l.id, {
                    name: l.name.trim(),
                    default_value: defaultValue ?? null,
                    unit: unit ?? null,
                    sort_order: index,
                  })
                : addLabel(config.id, l.name.trim(), defaultValue, unit, index);
            }),
          );
        } else {
          await createEntryConfig(
            item.id,
            editTrackingType,
            targetNum,
            cleanLabels.map((l) => ({
              name: l.name.trim(),
              default_value: l.defaultValue.trim() ? Number(l.defaultValue) : undefined,
              unit: l.unit.trim() || undefined,
            })),
          );
        }
      } else if (config) {
        await deleteEntryConfig(config.id);
      }

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

  async function handleDelete(item: ChecklistItemToday) {
    if (deletingId) return;
    if (!window.confirm(`Delete "${item.title}"? This removes its full completion history and can't be undone — use Archive instead to keep the history.`)) {
      return;
    }
    setError(null);
    setDeletingId(item.id);
    try {
      await deleteChecklistItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  function handleToggleExpand(itemId: string) {
    setExpandedId((prev) => (prev === itemId ? null : itemId));
  }

  return (
    <div className="recurring-items">
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

        <label className="day-detail-form__toggle">
          <input
            type="checkbox"
            checked={trackingEnabled}
            onChange={(e) => setTrackingEnabled(e.target.checked)}
          />
          Add tracking
        </label>

        {trackingEnabled && (
          <TrackingConfigFields
            frequency={newFrequency ?? 'daily'}
            type={trackingType}
            onTypeChange={setTrackingType}
            target={trackingTarget}
            onTargetChange={setTrackingTarget}
            labels={trackingLabels}
            onLabelsChange={setTrackingLabels}
            showErrors={attemptedSubmit}
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

                <label className="day-detail-form__toggle">
                  <input
                    type="checkbox"
                    checked={editTrackingEnabled}
                    onChange={(e) => setEditTrackingEnabled(e.target.checked)}
                  />
                  Add tracking
                </label>

                {editTrackingEnabled && (
                  <TrackingConfigFields
                    frequency={item.frequency}
                    type={editTrackingType}
                    onTypeChange={setEditTrackingType}
                    target={editTrackingTarget}
                    onTargetChange={setEditTrackingTarget}
                    labels={editTrackingLabels}
                    onLabelsChange={setEditTrackingLabels}
                    showErrors={editAttemptedSubmit}
                  />
                )}

                <div className="item-edit-form__buttons">
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
                </div>
              </form>
            ) : (
              <div key={item.id}>
                <RecurringItemRow
                  item={item}
                  config={entryConfigs[item.id]}
                  count={entryCounts[item.id]}
                  progressText={progress[item.id]}
                  expanded={expandedId === item.id}
                  onClick={() =>
                    entryConfigs[item.id] ? setDetailId(item.id) : handleToggleExpand(item.id)
                  }
                  actions={
                    <>
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
                      {entryConfigs[item.id] && (
                        <button
                          type="button"
                          className="item__action"
                          onClick={() => handleToggleExpand(item.id)}
                          title="Edit, delete, archive"
                        >
                          ⋯
                        </button>
                      )}
                    </>
                  }
                />
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
                      {!entryConfigs[item.id] && (
                        <button
                          type="button"
                          className="item__action"
                          onClick={() => handleToggle(item)}
                        >
                          {item.completedToday ? 'Uncomplete' : 'Complete'}
                        </button>
                      )}
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
                        onClick={() => handleDelete(item)}
                        disabled={deletingId === item.id}
                      >
                        {deletingId === item.id ? 'Deleting…' : 'Delete'}
                      </button>
                      {item.completedToday && (
                        <button
                          type="button"
                          className="item__action item__action--danger"
                          onClick={() => handleArchive(item)}
                          disabled={archivingId === item.id}
                        >
                          {archivingId === item.id ? 'Archiving…' : 'Archive'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {detailId && entryConfigs[detailId] && (
        <RecurringDetailPanel
          item={items.find((i) => i.id === detailId) as ChecklistItemToday}
          config={entryConfigs[detailId]}
          streakOrRate={progress[detailId] || ''}
          onClose={() => setDetailId(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
