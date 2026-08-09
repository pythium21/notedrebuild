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

function isRedditUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname;
    return /(^|\.)reddit\.com$|(^|\.)redd\.it$/i.test(host);
  } catch {
    return false;
  }
}

// Reddit's WAF blocks every server/datacenter fetch (see DECISIONS.md D-015),
// but this page runs on the user's own phone — the one network Reddit serves.
// Whether the browser can *read* the response hinges entirely on Reddit
// sending CORS headers; if it doesn't, the fetch throws immediately and we
// report the outcome so Railway logs settle the question. Two steps because
// appending .json to a /s/ short link doesn't survive its redirect: follow
// the redirect first (res.url = canonical), then fetch canonical .json.
async function tryClientRedditTitle(
  sharedUrl: string,
): Promise<{ title: string | null; note: string }> {
  try {
    const res = await fetch(sharedUrl, { redirect: 'follow' });
    const canonical = res.url || sharedUrl;
    const jsonUrl = new URL(canonical);
    jsonUrl.pathname = jsonUrl.pathname.replace(/\/?$/, '') + '.json';
    jsonUrl.search = 'raw_json=1';

    const jsonRes = await fetch(jsonUrl.toString(), { headers: { Accept: 'application/json' } });
    if (!jsonRes.ok) return { title: null, note: `client-json-status-${jsonRes.status}` };
    const data = await jsonRes.json();
    const rawTitle = data?.[0]?.data?.children?.[0]?.data?.title;
    if (typeof rawTitle === 'string' && rawTitle.trim()) {
      return { title: rawTitle.trim(), note: 'client-json-ok' };
    }
    return { title: null, note: 'client-json-shape' };
  } catch (e) {
    return { title: null, note: `client-fetch-failed: ${(e as Error).message}` };
  }
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
    const text = searchParams.get('text');
    const rawUrl = searchParams.get('url');
    const sharedUrl = resolveSharedUrl(rawUrl, text);

    // Diagnostic only — see MISTAKES.md / Reddit title investigation.
    console.log('[share-target] raw searchParams:', { title, text, url: rawUrl });

    if (!sharedUrl) {
      setStatus({ kind: 'error', message: 'No link found in the shared content.' });
      return;
    }

    const needsRedditTitle = isRedditUrl(sharedUrl) && (!title || URL_PATTERN.test(title));
    const clientTitlePromise = needsRedditTitle
      ? tryClientRedditTitle(sharedUrl)
      : Promise.resolve({ title: null as string | null, note: 'not-attempted' });

    clientTitlePromise
      .then((clientResult) =>
        fetch('/api/share-target', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // `text` and `clientNote` are diagnostic-only — not used in
          // title/URL resolution server-side.
          body: JSON.stringify({
            url: sharedUrl,
            title: title || clientResult.title || undefined,
            text: text || undefined,
            clientNote: clientResult.note,
          }),
        }),
      )
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
