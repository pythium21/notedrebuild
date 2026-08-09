// Server-only: fetches a URL and extracts its page title (og:title, falling
// back to <title>) for use as a save's title when none was supplied. Never
// import this into client-rendered code — it does raw outbound fetches.
// See DECISIONS.md D-015.

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^\[?::1\]?$/,
];

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

// Titles that mean "you hit a bot wall / login page", not the actual content.
// Worse than keeping the URL, so treat them as no-title.
const JUNK_TITLE_PATTERNS = [
  /^just a moment/i,
  /log in or sign up/i,
  /^sign in\b/i,
  /^access denied/i,
  /^attention required/i,
  /^security check/i,
  /^robot or human/i,
];

function usableTitle(raw: string): string | null {
  const title = decodeHtmlEntities(raw.trim());
  if (!title) return null;
  if (JUNK_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return null;
  return title;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

const FETCH_TIMEOUT_MS = 8000;
// Naively assumed title tags sit near the top of <head> — wrong in practice.
// YouTube's og:title, for example, is ~684KB into the document behind a huge
// blob of inlined JSON/scripts. 2MB comfortably covers heavy SPA pages too.
const MAX_BYTES = 2_000_000;

const REDDIT_HOSTS = ['reddit.com', 'redd.it'];

function isRedditHost(hostname: string): boolean {
  return REDDIT_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

// Reddit's share short-links (`/r/<sub>/s/<id>`) serve a client-rendered SPA
// shell to non-browser fetches — the initial HTML just has a generic
// <title>Reddit</title>, which the HTML scrape below happily accepts as
// "usable" since it doesn't match any bot-wall junk pattern. Reddit's own
// `.json` API returns the real post data directly, so try that first for
// reddit.com/redd.it URLs before falling back to the HTML scrape.
async function fetchRedditTitle(url: URL): Promise<string | null> {
  const jsonUrl = new URL(url.toString());
  jsonUrl.pathname = jsonUrl.pathname.replace(/\/?$/, '') + '.json';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(jsonUrl.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MyOSLinkPreview/1.0)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      console.log('[linkPreview] reddit .json fetch not ok:', jsonUrl.toString(), res.status);
      return null;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json')) return null;

    const data = await res.json();
    const rawTitle = data?.[0]?.data?.children?.[0]?.data?.title;
    const title = typeof rawTitle === 'string' ? usableTitle(rawTitle) : null;
    console.log('[linkPreview] reddit .json title:', jsonUrl.toString(), title);
    return title;
  } catch (err) {
    console.log('[linkPreview] reddit .json fetch failed:', jsonUrl.toString(), err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchPageTitle(rawUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHost(parsed.hostname)) return null;

  if (isRedditHost(parsed.hostname)) {
    const redditTitle = await fetchRedditTitle(parsed);
    if (redditTitle) return redditTitle;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MyOSLinkPreview/1.0)' },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    const reader = res.body?.getReader();
    let html = '';
    if (reader) {
      const decoder = new TextDecoder();
      while (html.length < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        html += decoder.decode(value, { stream: true });
      }
      reader.cancel().catch(() => {});
    } else {
      html = (await res.text()).slice(0, MAX_BYTES);
    }

    const ogMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/i);
    if (ogMatch) {
      const title = usableTitle(ogMatch[1]);
      if (title) return title;
    }

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = usableTitle(titleMatch[1]);
      if (title) return title;
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
