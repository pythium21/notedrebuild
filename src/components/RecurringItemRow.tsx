'use client';

import type { ReactNode } from 'react';
import type { ChecklistItemToday } from '@/lib/checklist';
import type { EntryConfigWithLabels } from '@/lib/entryConfig';

// The collapsed recurring-item row, used by the Recurring tab
// (RecurringItems.tsx, full move/edit/delete/archive actions + accordion).
// The Today page's "Daily habits" section used this list-row form under
// D-023; D-024 replaced it with a 4-column box grid (HabitBox in
// src/app/page.tsx) and no longer imports this component. Only the row's
// own display + click target is shared; each caller owns its own action
// controls and any panel that opens below/beside it.
export function RecurringItemRow({
  item,
  config,
  count,
  progressText,
  expanded,
  onClick,
  actions,
}: {
  item: ChecklistItemToday;
  config?: EntryConfigWithLabels;
  count?: number;
  progressText?: string;
  expanded?: boolean;
  onClick?: () => void;
  actions?: ReactNode;
}) {
  return (
    <div
      className={`item item--task${item.completedToday ? ' is-done' : ''}${expanded ? ' is-expanded' : ''}`}
      onClick={onClick}
    >
      <div className="item__main">
        <span className="item__text">
          <span className="item__name">
            {item.title}
            {config && (
              <span className="item__count">
                {' '}
                {count ?? 0}/{config.target}
              </span>
            )}
          </span>
          {progressText && <span className="item__progress">{progressText}</span>}
          {config && (
            <div className="progress-bar progress-bar--thin">
              <div
                className="progress-bar__fill"
                style={{
                  width: `${Math.min(100, Math.round(((count ?? 0) / config.target) * 100))}%`,
                }}
              />
            </div>
          )}
        </span>
      </div>
      {actions && (
        <div className="item__actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </div>
      )}
    </div>
  );
}
