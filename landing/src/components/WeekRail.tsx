'use client';

import { useEffect, useState } from 'react';
import { WEEK } from '@/lib/content';

/** Small moon used for Wednesday, the rest day. */
function Moon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path
        d="M10.8 1.6a6.6 6.6 0 1 0 3.6 11.2A5.6 5.6 0 0 1 10.8 1.6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Dot({ filled, rest, current }: { filled: boolean; rest?: boolean; current: boolean }) {
  if (rest) {
    return (
      <span
        className={`week-dot flex h-3.5 w-3.5 items-center justify-center ${
          filled ? 'text-deep-leaf' : 'text-[#B9B1A1]'
        } ${current ? 'scale-125' : ''}`}
      >
        <Moon className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span
      className={`week-dot block h-3 w-3 rounded-full border-[1.5px] ${
        filled ? 'border-leaf bg-leaf' : 'border-[#B9B1A1] bg-transparent'
      } ${current ? 'scale-125' : ''}`}
    />
  );
}

/**
 * The living week: a dot per day that fills as its section comes into view.
 * Desktop: sticky rail on the left. Mobile: slim sticky row under the nav.
 */
export default function WeekRail() {
  const [seen, setSeen] = useState<Record<string, boolean>>({});
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const els = WEEK.map((d) => document.getElementById(d.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (!els.length || !('IntersectionObserver' in window)) return;

    const ratios = new Map<string, number>();
    const thresholds = Array.from({ length: 21 }, (_, i) => i / 20);

    const io = new IntersectionObserver(
      (entries) => {
        const newlySeen: string[] = [];
        for (const entry of entries) {
          const id = entry.target.id;
          const viewport = entry.rootBounds?.height ?? window.innerHeight;
          // "In view" = 40% of the section, or 40% of the screen for sections taller than it.
          const base = Math.min(entry.boundingClientRect.height, viewport) || 1;
          const ratio = entry.intersectionRect.height / base;
          ratios.set(id, ratio);
          if (ratio >= 0.4) newlySeen.push(id);
        }
        if (newlySeen.length) {
          setSeen((prev) => {
            if (newlySeen.every((id) => prev[id])) return prev;
            const next = { ...prev };
            for (const id of newlySeen) next[id] = true;
            return next;
          });
        }
        let best: string | null = null;
        let bestRatio = 0.4;
        for (const [id, r] of ratios) {
          if (r >= bestRatio) {
            best = id;
            bestRatio = r;
          }
        }
        setCurrent(best);
      },
      { threshold: thresholds },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* Mobile: slim row under the nav */}
      <nav
        aria-label="The week"
        className="sticky top-16 z-30 border-b border-line bg-soil/95 backdrop-blur-sm lg:hidden"
      >
        <ol className="mx-auto flex max-w-xl items-stretch justify-between px-3">
          {WEEK.map((d) => (
            <li key={d.id} className="flex-1">
              <a
                href={`#${d.id}`}
                aria-current={current === d.id ? 'location' : undefined}
                className="flex min-h-[44px] items-center justify-center gap-1.5 text-xs font-semibold text-moss"
              >
                <span className={current === d.id ? 'text-bark' : ''} aria-hidden="true">
                  {d.initial}
                </span>
                <Dot filled={!!seen[d.id]} rest={d.rest} current={false} />
                <span className="sr-only">{d.name}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* Desktop: sticky rail on the left */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-30 hidden w-24 lg:block">
        <nav aria-label="The week" className="pointer-events-auto sticky top-[calc(50vh-11rem)] ml-6">
          <ol className="flex w-12 flex-col items-center gap-1 rounded-full border border-line bg-card py-3">
            {WEEK.map((d) => (
              <li key={d.id}>
                <a
                  href={`#${d.id}`}
                  aria-current={current === d.id ? 'location' : undefined}
                  className="flex h-11 w-11 flex-col items-center justify-center gap-1 rounded-full"
                  title={d.name}
                >
                  <span
                    className={`text-[11px] font-semibold leading-none ${
                      current === d.id ? 'text-bark' : 'text-moss'
                    }`}
                    aria-hidden="true"
                  >
                    {d.initial}
                  </span>
                  <Dot filled={!!seen[d.id]} rest={d.rest} current={current === d.id} />
                  <span className="sr-only">{d.name}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </div>
    </>
  );
}
