'use client';

import type { Frequency } from '@/lib/checklist';
import type { EntryType } from '@/lib/entryConfig';

// Shared "Add tracking" config sub-form (DECISIONS.md D-023) — used by both
// the recurring-item Add flow and the Edit flow, so the two never drift.

export interface TrackingLabelDraft {
  id?: string; // present when editing an existing entry_labels row
  name: string;
  defaultValue: string;
  unit: string;
}

const TYPE_DESCRIPTIONS: Record<EntryType, string> = {
  counter: 'Tap to count — e.g. cups of water, gym sessions',
  checklist: 'Tick off specific items — e.g. individual supplements',
  numeric: 'Enter a number — e.g. daily steps',
};

const TARGET_PLACEHOLDERS: Record<EntryType, string> = {
  counter: 'e.g. 8',
  checklist: 'e.g. 3',
  numeric: 'e.g. 8000',
};

const NAME_PLACEHOLDERS: Record<EntryType, string> = {
  counter: 'e.g. Cup, Bottle, Session',
  checklist: 'e.g. Vitamin D, Magnesium',
  numeric: 'e.g. Steps, Kilometres',
};

function targetLabel(frequency: Frequency): string {
  if (frequency === 'weekly') return 'Weekly target';
  if (frequency === 'monthly') return 'Monthly target';
  return 'Daily target';
}

export function isTrackingValid(target: string, labels: TrackingLabelDraft[]): boolean {
  const num = Number(target);
  return (
    target.trim().length > 0 &&
    Number.isInteger(num) &&
    num >= 1 &&
    labels.some((l) => l.name.trim().length > 0)
  );
}

export function TrackingConfigFields({
  frequency,
  type,
  onTypeChange,
  target,
  onTargetChange,
  labels,
  onLabelsChange,
  showErrors,
}: {
  frequency: Frequency;
  type: EntryType;
  onTypeChange: (t: EntryType) => void;
  target: string;
  onTargetChange: (v: string) => void;
  labels: TrackingLabelDraft[];
  onLabelsChange: (labels: TrackingLabelDraft[]) => void;
  showErrors: boolean;
}) {
  const targetNum = Number(target);
  const targetError = !showErrors
    ? null
    : target.trim().length === 0
      ? 'Target is required'
      : !Number.isInteger(targetNum) || targetNum < 1
        ? 'Target must be a positive whole number'
        : null;

  const hasAnyLabel = labels.some((l) => l.name.trim().length > 0);
  const previewLabels = labels.filter((l) => l.name.trim().length > 0);

  function updateLabel(index: number, field: 'name' | 'defaultValue' | 'unit', value: string) {
    onLabelsChange(labels.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function addLabel() {
    onLabelsChange([...labels, { name: '', defaultValue: '', unit: '' }]);
  }

  function removeLabel(index: number) {
    onLabelsChange(labels.filter((_, i) => i !== index));
  }

  return (
    <div className="tracking-config">
      <div>
        <div className="frequency-chips" role="group" aria-label="Tracking type">
          {(['counter', 'checklist', 'numeric'] as EntryType[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`chip chip--sm${type === t ? ' is-selected' : ''}`}
              onClick={() => onTypeChange(t)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <p className="field-hint">{TYPE_DESCRIPTIONS[type]}</p>
      </div>

      <div>
        <label className="field-label">{targetLabel(frequency)}</label>
        <input
          type="number"
          min={1}
          className="month-day-input"
          placeholder={TARGET_PLACEHOLDERS[type]}
          value={target}
          onChange={(e) => onTargetChange(e.target.value)}
        />
        {targetError ? (
          <p className="field-error">{targetError}</p>
        ) : (
          <p className="field-hint">Auto-completes when you hit this number</p>
        )}
      </div>

      <div className="tracking-labels">
        <p className="tracking-section-heading">What are you tracking?</p>
        {labels.map((label, index) => {
          const nameError = showErrors && label.name.trim().length === 0;
          return (
            <div key={index} className="tracking-label-row">
              <div className="tracking-label-field">
                <input
                  type="text"
                  placeholder={NAME_PLACEHOLDERS[type]}
                  value={label.name}
                  onChange={(e) => updateLabel(index, 'name', e.target.value)}
                />
                {nameError && <p className="field-error">Name is required</p>}
              </div>
              {type !== 'counter' && (
                <div className="tracking-label-field">
                  <input
                    type="number"
                    placeholder="e.g. 1000"
                    value={label.defaultValue}
                    onChange={(e) => updateLabel(index, 'defaultValue', e.target.value)}
                  />
                  <p className="field-hint">Optional — default amount per entry</p>
                </div>
              )}
              {type !== 'counter' && (
                <div className="tracking-label-field">
                  <input
                    type="text"
                    placeholder="e.g. mg, ml, IU, steps"
                    value={label.unit}
                    onChange={(e) => updateLabel(index, 'unit', e.target.value)}
                  />
                  <p className="field-hint">Optional — unit of measurement</p>
                </div>
              )}
              {labels.length > 1 && (
                <button
                  type="button"
                  className="item__action item__action--danger"
                  onClick={() => removeLabel(index)}
                >
                  Remove
                </button>
              )}
            </div>
          );
        })}
        {showErrors && !hasAnyLabel && <p className="field-error">At least one label is required</p>}
        <button type="button" className="item__action" onClick={addLabel}>
          + Add another
        </button>
      </div>

      <div className="tracking-preview">
        <p className="tracking-preview__label">Preview</p>
        {type === 'numeric' ? (
          <div className="numeric-log-row">
            <input type="number" placeholder="0" disabled />
            <span className="item__progress">{labels[0]?.unit.trim() || ''}</span>
          </div>
        ) : (
          <div className="entry-chip-row">
            {previewLabels.length === 0 ? (
              <span className="list-empty">Add a label above to preview</span>
            ) : (
              previewLabels.map((l, i) => (
                <span key={i} className="chip">
                  {type === 'checklist' ? '☐' : '+'} {l.name.trim()}
                </span>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
