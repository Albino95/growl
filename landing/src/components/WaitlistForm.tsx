'use client';

import { FormEvent, useEffect, useId, useState } from 'react';

/** Session-only memory: show "You're on the list" until the tab is closed, never forever. */
const SESSION_KEY = 'grow-android-waitlist';

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export default function WaitlistForm({ inputId = 'android-email' }: { inputId?: string }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const labelId = useId();
  const errorId = useId();

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(SESSION_KEY)) setStatus('ok');
    } catch {
      /* storage unavailable */
    }
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setStatus('error');
      setMessage('That email doesn’t look right. Check it and try again.');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: trimmed,
          platform: 'android',
          source: 'landing',
          // Honeypot: real people never see or fill this field.
          company: (form.elements.namedItem('company') as HTMLInputElement | null)?.value ?? '',
        }),
      });
      if (!res.ok) {
        let error = 'Something went wrong. Try again in a moment.';
        try {
          const data = (await res.json()) as { error?: string };
          if (data.error) error = data.error;
        } catch {
          /* non-JSON error */
        }
        setStatus('error');
        setMessage(error);
        return;
      }
      try {
        window.sessionStorage.setItem(SESSION_KEY, '1');
      } catch {
        /* ignore */
      }
      setStatus('ok');
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('No connection. Try again in a moment.');
    }
  };

  if (status === 'ok') {
    return (
      <p role="status" className="text-[0.9375rem] text-bark">
        <span className="font-semibold">You’re on the list.</span>{' '}
        <span className="text-moss">One email, when Grow! is ready on Android.</span>
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate aria-labelledby={labelId} className="w-full max-w-md">
      <p id={labelId} className="text-[0.9375rem] text-moss">
        On Android? We’ll email you once, when it’s ready.
      </p>
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      <div className="mt-2.5 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Email address
        </label>
        <input
          id={inputId}
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
          aria-describedby={status === 'error' ? errorId : undefined}
          className="min-h-[44px] min-w-0 flex-1 rounded-[14px] border border-[#CFC7B6] bg-card px-3.5 text-base text-bark placeholder:text-[#8A847C] focus-visible:border-leaf"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="min-h-[44px] shrink-0 rounded-[14px] border border-bark/80 px-4 text-sm font-semibold text-bark transition-colors hover:bg-bark hover:text-soil disabled:opacity-60"
        >
          {status === 'loading' ? 'Sending…' : 'Notify me'}
        </button>
      </div>
      {status === 'error' ? (
        <p id={errorId} role="alert" className="mt-2 text-sm text-[#B42318]">
          {message}
        </p>
      ) : null}
    </form>
  );
}
