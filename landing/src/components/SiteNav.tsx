'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion, useScroll, useMotionValueEvent } from 'framer-motion';
import { List, X } from '@phosphor-icons/react';

const links = [
  { href: '/#about', label: 'About' },
  { href: '/#how', label: 'How it works' },
  { href: '/#paths', label: 'Paths' },
  { href: '/#features', label: 'Features' },
  { href: '/#faq', label: 'FAQ' },
];

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, 'change', (y) => {
    setScrolled(y > 24);
  });

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <motion.nav
      initial={reduced ? false : { y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={`fixed inset-x-0 top-0 z-50 transition-[background,border-color,box-shadow] duration-300 ${
        scrolled || open
          ? 'border-b border-stone-900/8 bg-[var(--surface)]/90 shadow-[0_8px_30px_rgba(28,25,23,0.06)] backdrop-blur-md'
          : 'border-b border-transparent bg-transparent'
      }`}
      aria-label="Primary"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:px-8 lg:px-10">
        <a
          href="/"
          className="font-display text-xl font-extrabold tracking-tight text-stone-900"
          onClick={() => setOpen(false)}
        >
          Grow<span className="text-emerald-600">!</span>
        </a>

        <div className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-stone-600 transition hover:text-stone-900"
            >
              {l.label}
            </a>
          ))}
          <a
            href="/#early-access"
            className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 active:scale-[0.98]"
          >
            Early access
          </a>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-stone-900/10 bg-[var(--surface-elevated)] text-stone-900 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
        </button>
      </div>

      {open ? (
        <div
          id="mobile-nav"
          className="border-t border-stone-900/8 bg-[var(--surface)] px-6 py-5 md:hidden"
        >
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-xl px-3 py-3 text-base font-medium text-stone-800"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <a
              href="/#early-access"
              className="mt-3 rounded-2xl bg-emerald-700 px-4 py-3.5 text-center text-sm font-semibold text-white"
              onClick={() => setOpen(false)}
            >
              Early access
            </a>
          </div>
        </div>
      ) : null}
    </motion.nav>
  );
}
