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

export async function fetchPageTitle(rawUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (isPrivateHost(parsed.hostname)) return null;

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
    if (ogMatch && ogMatch[1].trim()) return decodeHtmlEntities(ogMatch[1].trim());

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1].trim()) return decodeHtmlEntities(titleMatch[1].trim());

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
