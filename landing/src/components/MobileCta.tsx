'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { APP_STORE_URL } from '@/lib/seo';

/** Android visitors go to the waitlist; everyone else (iPhone, unknown) to the App Store. */
function onGetClick(e: MouseEvent<HTMLAnchorElement>) {
  if (!/android/i.test(navigator.userAgent)) return;
  const target = document.getElementById('android');
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ block: 'center' });
  const input = target.querySelector('input');
  input?.focus({ preventScroll: true });
}

export function GetAppButton({ className = '' }: { className?: string }) {
  return (
    <a
      href={APP_STORE_URL}
      onClick={onGetClick}
      className={`inline-flex min-h-[52px] items-center justify-center rounded-full bg-leaf px-6 text-base font-semibold text-white transition-colors hover:bg-leaf-hover ${className}`}
    >
      Get Grow! — free
    </a>
  );
}

/**
 * Mobile-only bottom bar. Appears once the hero has scrolled away and
 * hides again when the final call to action is on screen.
 */
export function StickyGetBar() {
  const [heroGone, setHeroGone] = useState(false);
  const [finalVisible, setFinalVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('top');
    const final = document.getElementById('get-grow');
    if (!hero || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === hero) setHeroGone(!entry.isIntersecting);
        if (entry.target === final) setFinalVisible(entry.isIntersecting);
      }
    });
    io.observe(hero);
    if (final) io.observe(final);
    return () => io.disconnect();
  }, []);

  const show = heroGone && !finalVisible;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-soil/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm transition-transform duration-300 md:hidden ${
        show ? 'translate-y-0' : 'pointer-events-none translate-y-full'
      }`}
      aria-hidden={!show}
      inert={!show}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-display text-lg font-bold tracking-[-0.02em] text-bark">Start your week</p>
        <GetAppButton className="min-h-[44px] px-5 text-[0.9375rem]" />
      </div>
    </div>
  );
}
