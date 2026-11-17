'use client';

import { useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';

/** Copies an invite code; falls back to selecting the text when the clipboard is blocked. */
export default function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const el = document.getElementById('invite-code');
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={onCopy}
      className="inline-flex items-center gap-2 rounded-full border border-stone-300/80 bg-white px-4 py-2 text-sm font-semibold text-stone-800 transition hover:border-emerald-600/50 hover:text-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      aria-live="polite"
    >
      {copied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
      {copied ? 'Copied' : 'Copy code'}
    </button>
  );
}
