'use client';

import { FormEvent, useEffect, useState } from 'react';

const STORAGE_KEY = 'grow-waitlist-joined';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export default function WaitlistForm({
  variant = 'hero',
}: {
  variant?: 'hero' | 'footer' | 'dark';
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY)) {
        setStatus('ok');
        setMessage('You’re already on the Grow! early access list.');
      }
    } catch {
      /* ignore */
    }
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setStatus('error');
      setMessage('Enter a valid email address.');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) {
        setStatus('error');
        setMessage(data.error || 'Something went wrong. Try again.');
        return;
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, '1');
      } catch {
        /* ignore */
      }
      setStatus('ok');
      setMessage(data.message || 'You’re on the list. We’ll email you when Grow! launches.');
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('Network error. Try again.');
    }
  };

  const isDark = variant === 'dark';
  const isHero = variant === 'hero';

  if (status === 'ok') {
    return (
      <div
        className={`rounded-2xl border px-4 py-4 text-sm ${
          isDark
            ? 'border-emerald-300/30 bg-emerald-400/10 text-emerald-50'
            : 'border-emerald-200/80 bg-emerald-50 text-emerald-900'
        }`}
        role="status"
      >
        <p className="font-semibold">You’re in.</p>
        <p className="mt-1 opacity-90">{message}</p>
        <button
          type="button"
          className={`mt-3 text-xs font-semibold underline-offset-2 hover:underline ${
            isDark ? 'text-emerald-100' : 'text-emerald-800'
          }`}
          onClick={() => {
            try {
              window.localStorage.removeItem(STORAGE_KEY);
            } catch {
              /* ignore */
            }
            setStatus('idle');
            setMessage('');
          }}
        >
          Add another email
        </button>
      </div>
    );
  }

  return (
    <div className={`w-full ${isHero || isDark ? 'max-w-md' : 'max-w-lg'}`}>
      <form
        onSubmit={onSubmit}
        className="flex w-full flex-col gap-3 sm:flex-row sm:items-stretch"
        noValidate
      >
        <label className="sr-only" htmlFor={`waitlist-email-${variant}`}>
          Email address
        </label>
        <input
          id={`waitlist-email-${variant}`}
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status === 'error') {
              setStatus('idle');
              setMessage('');
            }
          }}
          disabled={status === 'loading'}
          aria-invalid={status === 'error'}
          className={`min-h-12 flex-1 rounded-2xl border px-4 text-base outline-none transition focus:ring-2 focus:ring-emerald-500/50 ${
            isDark
              ? 'border-white/20 bg-white/10 text-white placeholder:text-emerald-100/55'
              : 'border-stone-300/90 bg-[var(--surface-elevated)] text-stone-900 placeholder:text-stone-400 shadow-[0_1px_0_rgba(28,25,23,0.04)]'
          }`}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className={`min-h-12 shrink-0 rounded-2xl px-6 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-60 ${
            isDark
              ? 'bg-white text-emerald-950 hover:bg-emerald-50'
              : 'bg-emerald-700 text-white hover:bg-emerald-800'
          }`}
        >
          {status === 'loading' ? 'Joining…' : 'Get early access'}
        </button>
      </form>
      {message && status === 'error' ? (
        <p className={`mt-2 text-sm ${isDark ? 'text-red-200' : 'text-red-600'}`} role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
