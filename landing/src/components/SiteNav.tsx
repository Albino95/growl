'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

const links = [
  { href: '#about', label: 'About' },
  { href: '#how', label: 'How it works' },
  { href: '#paths', label: 'Paths' },
  { href: '#features', label: 'Features' },
  { href: '#faq', label: 'FAQ' },
];

export default function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <motion.nav
      initial={reduced ? false : { y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45 }}
      className={`fixed inset-x-0 top-0 z-50 transition ${
        scrolled || open
          ? 'border-b border-white/10 bg-[#0c1f17]/90 backdrop-blur-md'
          : 'bg-transparent'
      }`}
      aria-label="Primary"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6 sm:px-8 lg:px-10">
        <a href="/" className="font-display text-xl font-extrabold tracking-tight text-white">
          Grow<span className="text-emerald-400">!</span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-emerald-50/80 transition hover:text-white"
            >
              {l.label}
            </a>
          ))}
          <a
            href="#early-access"
            className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400"
          >
            Early access
          </a>
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 text-white md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Menu</span>
          <span aria-hidden className="text-lg leading-none">
            {open ? '✕' : '☰'}
          </span>
        </button>
      </div>

      {open ? (
        <div
          id="mobile-nav"
          className="border-t border-white/10 bg-[#0c1f17] px-6 py-4 md:hidden"
        >
          <div className="flex flex-col gap-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-xl px-3 py-3 text-base font-medium text-emerald-50"
                onClick={() => setOpen(false)}
              >
                {l.label}
              </a>
            ))}
            <a
              href="#early-access"
              className="mt-2 rounded-2xl bg-emerald-500 px-4 py-3 text-center text-sm font-semibold text-emerald-950"
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
