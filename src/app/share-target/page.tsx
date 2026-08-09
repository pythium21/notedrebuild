'use client';

import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const URL_PATTERN = /https?:\/\/\S+/i;

// Some Android share targets (e.g. plain-text shares) only populate `text`,
// leaving `url` empty — fall back to pulling the first link out of it.
function resolveSharedUrl(url: string | null, text: string | null): string {
  if (url && url.trim()) return url.trim();
  const match = text?.match(URL_PATTERN);
  return match ? match[0] : '';
}

type Status =
  | { kind: 'saving' | 'done' | 'error'; message: string }
  | { kind: 'title'; saveId: string; platform: string };

function ShareTargetInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'saving', message: 'Saving…' });
  const [titleInput, setTitleInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    const title = searchParams.get('title');
    const sharedUrl = resolveSharedUrl(searchParams.get('url'), searchParams.get('text'));

    if (!sharedUrl) {
      setStatus({ kind: 'error', message: 'No link found in the shared content.' });
      return;
    }

    fetch('/api/share-target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: sharedUrl, title: title || undefined }),
    })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Save failed');
        // A URL-shaped title means every automated fetch came up empty — for
        // Reddit that is guaranteed (it blocks servers, proxies, and browser
        // CORS alike; DECISIONS.md D-015). Offer a quick optional title
        // instead of redirecting straight away.
        if (typeof body.title === 'string' && URL_PATTERN.test(body.title)) {
          setStatus({ kind: 'title', saveId: body.id, platform: body.platform });
        } else {
          setStatus({ kind: 'done', message: `Saved to ${body.platform} ✓` });
        }
      })
      .catch((e) => setStatus({ kind: 'error', message: (e as Error).message }));
  }, [searchParams]);

  useEffect(() => {
    if (status.kind !== 'done' && status.kind !== 'error') return;
    const timer = setTimeout(() => router.replace('/saves'), 1200);
    return () => clearTimeout(timer);
  }, [status.kind, router]);

  async function handleTitleSave(e: FormEvent) {
    e.preventDefault();
    if (status.kind !== 'title' || isSaving) return;
    const title = titleInput.trim();
    if (!title) {
      setStatus({ kind: 'done', message: `Saved to ${status.platform} ✓` });
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch('/api/share-target', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: status.saveId, title }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Title update failed');
      setStatus({ kind: 'done', message: `Saved to ${body.platform} ✓` });
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    } finally {
      setIsSaving(false);
    }
  }

  if (status.kind === 'title') {
    return (
      <div>
        <h1 className="page-title">Saves</h1>
        <p className="list-empty">Saved ✓ — no title could be fetched for this link.</p>
        <form className="add-form" onSubmit={handleTitleSave}>
          <input
            type="text"
            className="add-form__name"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="Add a title (optional)"
            autoFocus
          />
          <button type="submit" className="add-form__submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save title'}
          </button>
          <button
            type="button"
            className="add-form__submit"
            disabled={isSaving}
            onClick={() => setStatus({ kind: 'done', message: 'Saved ✓' })}
          >
            Skip
          </button>
        </form>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Saves</h1>
      <p className={status.kind === 'error' ? 'auth-error' : 'list-empty'}>{status.message}</p>
    </div>
  );
}

export default function ShareTargetPage() {
  return (
    <Suspense fallback={<p className="list-empty">Saving…</p>}>
      <ShareTargetInner />
    </Suspense>
  );
}
