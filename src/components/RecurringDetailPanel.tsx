'use client';

import { useEffect, useState } from 'react';
import { BreadcrumbMenu } from '@/components/BreadcrumbMenu';
import type { EntryConfigWithLabels } from '@/lib/entryConfig';
import {
  deleteEntry,
  getEntriesForPeriod,
  logEntry,
  periodRangeForFrequency,
  type RecurringEntry,
} from '@/lib/recurringEntries';
import type { ChecklistItemToday } from '@/lib/checklist';

function periodLabel(frequency: ChecklistItemToday['frequency']): string {
  if (frequency === 'weekly') return 'This week';
  if (frequency === 'monthly') return 'This month';
  return 'Today';
}

function formatLoggedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Parses RecurringItems.tsx's existing sub-line text ("N day streak" /
// "done/due this quarter") into the compact "12d" / "89%" stat-card form —
// avoids computing streak/rate a second time in this panel.
function formatStreakOrRate(progressText: string, frequency: ChecklistItemToday['frequency']): string {
  if (frequency === 'daily') {
    const match = progressText.match(/^(\d+)/);
    return match ? `${match[1]}d` : '–';
  }
  const match = progressText.match(/^(\d+)\/(\d+)/);
  if (!match) return '–';
  const [, doneStr, dueStr] = match;
  const due = Number(dueStr);
  if (due === 0) return '–';
  return `${Math.round((Number(doneStr) / due) * 100)}%`;
}

// Recurring item detail panel (DECISIONS.md D-022) — BreadcrumbMenu pattern,
// same as Calendar day detail / Project detail. Only rendered for items that
// have an entry_config; untracked items keep the plain accordion panel.
export function RecurringDetailPanel({
  item,
  config,
  streakOrRate,
  onClose,
  onChanged,
}: {
  item: ChecklistItemToday;
  config: EntryConfigWithLabels;
  streakOrRate: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { start, end } = periodRangeForFrequency(item.frequency);
  const [entries, setEntries] = useState<RecurringEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggingLabelId, setLoggingLabelId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [numericValue, setNumericValue] = useState('');
  const [isLoggingNumeric, setIsLoggingNumeric] = useState(false);

  function reloadEntries() {
    return getEntriesForPeriod(item.id, start, end)
      .then(setEntries)
      .catch((e) => setError((e as Error).message));
  }

  useEffect(() => {
    reloadEntries().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const count = entries.length;
  const target = config.target;
  const pct = target > 0 ? Math.min(100, Math.round((count / target) * 100)) : 0;

  const checkedLabelIds = new Set(
    config.type === 'checklist' ? entries.map((e) => e.entry_label_id).filter(Boolean) : [],
  );

  async function handleCounterTap(labelId: string, defaultValue: number | null) {
    if (loggingLabelId) return;
    setError(null);
    setLoggingLabelId(labelId);
    try {
      await logEntry(item.id, labelId, defaultValue ?? undefined);
      await reloadEntries();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoggingLabelId(null);
    }
  }

  async function handleChecklistToggle(labelId: string) {
    if (loggingLabelId) return;
    setError(null);
    setLoggingLabelId(labelId);
    try {
      const existing = entries.find((e) => e.entry_label_id === labelId);
      if (existing) {
        await deleteEntry(existing.id);
      } else {
        await logEntry(item.id, labelId);
      }
      await reloadEntries();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoggingLabelId(null);
    }
  }

  async function handleNumericLog() {
    const value = Number(numericValue);
    if (isLoggingNumeric || !numericValue.trim() || Number.isNaN(value)) return;
    setError(null);
    setIsLoggingNumeric(true);
    try {
      const labelId = config.entry_labels[0]?.id;
      await logEntry(item.id, labelId, value);
      await reloadEntries();
      onChanged();
      setNumericValue('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoggingNumeric(false);
    }
  }

  async function handleDeleteEntry(entry: RecurringEntry) {
    if (deletingId) return;
    setError(null);
    setDeletingId(entry.id);
    try {
      await deleteEntry(entry.id);
      await reloadEntries();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  function labelName(entryLabelId: string | null): string {
    if (!entryLabelId) return 'Entry';
    return config.entry_labels.find((l) => l.id === entryLabelId)?.name || 'Entry';
  }

  return (
    <BreadcrumbMenu onClose={onClose}>
      <div className="day-detail recurring-detail">
        <nav className="breadcrumb">
          <span>Recurring</span>
          <span className="breadcrumb__sep">/</span>
          <span className="breadcrumb__current">{item.title}</span>
        </nav>

        {error && <p className="auth-error">{error}</p>}

        <div className="stat-row">
          <div className="stat-card">
            <span className="stat-card__value">
              {count}/{target}
            </span>
            <span className="stat-card__label">{periodLabel(item.frequency)}</span>
          </div>
          <div className="stat-card">
            <span className="stat-card__value">{formatStreakOrRate(streakOrRate, item.frequency)}</span>
            <span className="stat-card__label">
              {item.frequency === 'daily' ? 'Streak' : 'Rate'}
            </span>
          </div>
        </div>

        <div className="progress-bar">
          <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
        </div>

        <div className="recurring-log-section">
          <p className="page-hint">Log an entry</p>
          {config.type === 'counter' && (
            <div className="entry-chip-row">
              {config.entry_labels.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  className="chip"
                  onClick={() => handleCounterTap(label.id, label.default_value)}
                  disabled={loggingLabelId === label.id}
                >
                  + {label.name}
                </button>
              ))}
            </div>
          )}
          {config.type === 'checklist' && (
            <div className="entry-chip-row">
              {config.entry_labels.map((label) => {
                const checked = checkedLabelIds.has(label.id);
                return (
                  <button
                    key={label.id}
                    type="button"
                    className={`chip${checked ? ' is-selected' : ''}`}
                    onClick={() => handleChecklistToggle(label.id)}
                    disabled={loggingLabelId === label.id}
                  >
                    {checked ? '✓' : '+'} {label.name}
                  </button>
                );
              })}
            </div>
          )}
          {config.type === 'numeric' && (
            <div className="numeric-log-row">
              <input
                type="number"
                value={numericValue}
                onChange={(e) => setNumericValue(e.target.value)}
                placeholder="0"
              />
              <span className="item__progress">{config.entry_labels[0]?.unit || ''}</span>
              <button
                type="button"
                className="add-form__submit"
                onClick={handleNumericLog}
                disabled={isLoggingNumeric || !numericValue.trim()}
              >
                {isLoggingNumeric ? 'Logging…' : 'Log'}
              </button>
            </div>
          )}
        </div>

        <div className="recurring-log-section">
          <p className="page-hint">{periodLabel(item.frequency)}&rsquo;s log</p>
          {loading ? null : entries.length === 0 ? (
            <p className="list-empty">No entries yet.</p>
          ) : (
            <div className="list">
              {entries.map((entry) => (
                <div key={entry.id} className="item">
                  <span className="item__text">
                    <span className="item__name">{labelName(entry.entry_label_id)}</span>
                    <span className="item__progress">
                      {entry.value != null ? `${entry.value} · ` : ''}
                      {formatLoggedAt(entry.logged_at)}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="item__action item__action--danger"
                    onClick={() => handleDeleteEntry(entry)}
                    disabled={deletingId === entry.id}
                  >
                    {deletingId === entry.id ? '…' : 'Undo'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BreadcrumbMenu>
  );
}
