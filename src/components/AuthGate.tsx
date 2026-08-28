'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

const COOLDOWN_SECONDS = 60;

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  // Supabase redirects an expired / already-used / invalid magic link back here
  // with the reason in the URL hash (`#error=...&error_description=...`). Read it
  // during the first render, before the Supabase client's own URL handling can
  // strip the hash, so the user gets told why they landed on the sign-in screen
  // instead of a silent bounce (AUDIT.md 2026-08-25, Section 9).
  const [error, setError] = useState<string | null>(() => {
    if (typeof window === 'undefined' || !window.location.hash) return null;
    return new URLSearchParams(window.location.hash.slice(1)).get('error_description');
  });
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash.includes('error')) {
      // Drop the error fragment so it doesn't survive a reload or a later sign-in.
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    if (cooldown > 0) return;
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
      },
    });
    if (signInError) {
      setError(signInError.message);
      if (signInError.message.toLowerCase().includes('rate limit')) {
        setCooldown(COOLDOWN_SECONDS);
      }
    } else {
      setSent(true);
      setCooldown(COOLDOWN_SECONDS);
    }
  }

  if (loading) return null;

  if (!session) {
    return (
      <div className="auth-screen">
        <h1>My OS</h1>
        {sent ? (
          <>
            <p>Check your email for a sign-in link.</p>
            <form onSubmit={handleSignIn} className="auth-form">
              <button type="submit" disabled={cooldown > 0}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend magic link'}
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={handleSignIn} className="auth-form">
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <button type="submit" disabled={cooldown > 0}>
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send magic link'}
            </button>
          </form>
        )}
        {error && <p className="auth-error">{error}</p>}
      </div>
    );
  }

  return <>{children}</>;
}