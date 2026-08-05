'use client';

import { useState } from 'react';

export function Picker<T>({
  title,
  items,
  getKey,
  getLabel,
  getSubLabel,
  onSelect,
  onClose,
  emptyLabel = 'Nothing to show.',
  searchable = true,
}: {
  title: string;
  items: T[];
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string | null | undefined;
  onSelect: (item: T) => void;
  onClose: () => void;
  emptyLabel?: string;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const filtered =
    searchable && query.trim()
      ? items.filter((item) => getLabel(item).toLowerCase().includes(query.trim().toLowerCase()))
      : items;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <span className="modal__title">{title}</span>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {searchable && (
          <input
            type="text"
            className="modal__search"
            placeholder="Search…"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}
        <div className="modal__list">
          {filtered.length === 0 ? (
            <p className="list-empty">{emptyLabel}</p>
          ) : (
            filtered.map((item) => (
              <button key={getKey(item)} type="button" className="modal__item" onClick={() => onSelect(item)}>
                <span className="modal__item-label">{getLabel(item)}</span>
                {getSubLabel && getSubLabel(item) && (
                  <span className="modal__item-sublabel">{getSubLabel(item)}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
