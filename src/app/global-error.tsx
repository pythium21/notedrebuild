'use client';

// Replaces the root layout when the layout itself throws, so it can't rely on
// globals.css being applied — styles are inlined. The common case is handled by
// the sibling `error.tsx`; this is the last-resort shell (AUDIT.md, Section 4).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1rem',
          padding: '1.5rem',
          textAlign: 'center',
        }}
      >
        <h1>Something broke</h1>
        <p>The app failed to load. Reloading usually fixes it.</p>
        <button
          type="button"
          onClick={reset}
          style={{ padding: '0.75rem 1rem', border: 'none', borderRadius: '8px', fontWeight: 600 }}
        >
          Try again
        </button>
        {error?.message && (
          <p style={{ color: '#c0392b', fontSize: '0.9rem' }}>{error.message}</p>
        )}
      </body>
    </html>
  );
}
