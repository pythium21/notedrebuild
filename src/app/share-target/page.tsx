'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const URL_PATTERN = /https?:\/\/\S+/i;

// Some Android share targets (e.g. plain-text shares) only populate `text`,
// leaving `url` empty — fall back to pulling the first link out of it.
function resolveSharedUrl(url: string | null, text: string | null): string {
  if (url && url.trim()) return url.trim();
  const match = text?.match(URL_PATTERN);
  return match ? match[0] : '';
}

type Status = { kind: 'saving' | 'done' | 'error'; message: string };

function ShareTargetInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: 'saving', message: 'Saving…' });
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
        setStatus({ kind: 'done', message: `Saved to ${body.platform} ✓` });
      })
      .catch((e) => setStatus({ kind: 'error', message: (e as Error).message }));
  }, [searchParams]);

  useEffect(() => {
    if (status.kind === 'saving') return;
    const timer = setTimeout(() => router.replace('/saves'), 1200);
    return () => clearTimeout(timer);
  }, [status.kind, router]);

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
