'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { createSave, listSaves, PLATFORMS, type Platform, type Save } from '@/lib/saves';

export default function SavesPage() {
  const [saves, setSaves] = useState<Save[]>([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<Platform | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    listSaves()
      .then(setSaves)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || isAdding) return;
    setError(null);
    setIsAdding(true);
    try {
      const save = await createSave({
        url: url.trim(),
        title: title.trim(),
        platform: platform || undefined,
      });
      setSaves((prev) => [save, ...prev]);
      setUrl('');
      setTitle('');
      setPlatform('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Saves</h1>

      <form className="add-form" onSubmit={handleAdd}>
        <input
          type="url"
          className="add-form__name"
          placeholder="Paste a link…"
          autoFocus
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform | '')}>
          <option value="">Auto-detect</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button type="submit" className="add-form__submit" disabled={isAdding}>
          {isAdding ? 'Adding…' : 'Add'}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}

      {loading ? null : saves.length === 0 ? (
        <p className="list-empty">No saves yet — add a link above.</p>
      ) : (
        <div className="list">
          {saves.map((save) => (
            <a key={save.id} href={save.url} target="_blank" rel="noreferrer" className="item">
              <span className="item__name">{save.title}</span>
              <span className="item__tag">{save.platform}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
