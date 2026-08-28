'use client';

import { useEffect } from 'react';

// Route-level error boundary (AUDIT.md 2026-08-25, Section 4). Without this, an
// uncaught render-time exception in any page or component falls through to
// Next's default unstyled error screen with no way back. `global-error.tsx`
// covers the narrower case of the root layout itself throwing.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="auth-screen">
      <h1>Something broke</h1>
      <p>This screen hit an error and couldn’t finish loading. Try again, or reload the app.</p>
      <div className="auth-form">
        <button type="button" onClick={reset}>
          Try again
        </button>
      </div>
      {error?.message && <p className="auth-error">{error.message}</p>}
    </div>
  );
}
