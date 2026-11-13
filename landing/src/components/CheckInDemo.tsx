'use client';

import { useId, useRef, useState } from 'react';
import { LEAF_PATH, MARK_VIEWBOX, SMILE_PATH, TAIL_PATH } from './brand';

/** Mirrors the app's Today card (frontend/src/components/feed/TodayCard.tsx). */
const MOODS = [
  { id: 'heavy', glyph: '🌧', label: 'Heavy' },
  { id: 'tired', glyph: '🌙', label: 'Tired' },
  { id: 'okay', glyph: '◇', label: 'Okay' },
  { id: 'good', glyph: '😊', label: 'Good' },
  { id: 'bright', glyph: '⚡', label: 'Bright' },
] as const;

const PATHS = ['Fitness', 'Language', 'Art'] as const;

const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type Mood = (typeof MOODS)[number]['id'];
type Path = (typeof PATHS)[number];

function WeekDots({ filled }: { filled: boolean }) {
  return (
    <div className="flex items-center gap-[5px]" aria-hidden="true">
      {WEEK.map((d, i) => (
        <span
          key={i}
          className={`week-dot block h-2 w-2 rounded-full border ${
            i === 0 && filled ? 'border-leaf bg-leaf' : i === 0 ? 'border-leaf bg-transparent' : 'border-[#D6CFC0] bg-transparent'
          }`}
        />
      ))}
    </div>
  );
}

function Seedling({ sprouted }: { sprouted: boolean }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      className={`h-[136px] w-auto overflow-visible text-leaf ${sprouted ? 'is-sprouted' : ''}`}
      aria-hidden="true"
      fill="none"
    >
      {/* Before Done: a seed resting in the arc. After: it sprouts into the full mark. */}
      {sprouted ? (
        <path d={LEAF_PATH} fill="currentColor" className="sprout-leaf" />
      ) : (
        <ellipse cx={515} cy={706} rx={38} ry={27} transform="rotate(-18 515 706)" fill="var(--deep-leaf)" />
      )}
      <path d={SMILE_PATH} stroke="currentColor" strokeWidth={66} strokeLinecap="round" />
      <path d={TAIL_PATH} stroke="currentColor" strokeWidth={40} strokeLinecap="round" />
    </svg>
  );
}

export default function CheckInDemo() {
  const [mood, setMood] = useState<Mood | null>(null);
  const [path, setPath] = useState<Path | null>(null);
  const [done, setDone] = useState(false);
  const [announce, setAnnounce] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);
  const firstMoodRef = useRef<HTMLButtonElement>(null);
  const uid = useId();
  const pathLabelId = `${uid}-path`;

  const finish = () => {
    if (!mood || !path) return;
    setDone(true);
    setAnnounce(`Checked in. 1-day streak. ${path}.`);
    requestAnimationFrame(() => resultRef.current?.focus());
  };

  const reset = () => {
    setMood(null);
    setPath(null);
    setDone(false);
    setAnnounce('Check-in cleared. How are you arriving today?');
    requestAnimationFrame(() => firstMoodRef.current?.focus());
  };

  return (
    <div className="relative flex min-h-[500px] flex-col">
      <p className="sr-only" aria-live="polite" role="status">
        {announce}
      </p>

      {/* Today card — same structure and words as the app. */}
      <div className="rounded-card border border-line bg-card px-4 pb-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[1.0625rem] font-bold leading-tight text-bark">Good morning.</p>
            <p className="mt-0.5 text-sm text-moss">How are you arriving today?</p>
          </div>
          <div className="flex flex-col items-end gap-1 pt-1.5">
            <WeekDots filled={done} />
            {done ? <span className="text-[10px] font-semibold text-[#B4382F]">1-day streak</span> : null}
          </div>
        </div>

        {!done ? (
          <>
            <div role="group" aria-label="Mood" className="mt-3 grid grid-cols-5 gap-1">
              {MOODS.map((m, i) => {
                const selected = mood === m.id;
                return (
                  <button
                    key={m.id}
                    ref={i === 0 ? firstMoodRef : undefined}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setMood(m.id)}
                    className={`flex min-h-[58px] flex-col items-center justify-center rounded-2xl border px-1 py-1.5 transition-colors ${
                      selected
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-transparent hover:bg-subtle/70'
                    }`}
                  >
                    <span className="text-xl leading-none" aria-hidden="true">
                      {m.glyph}
                    </span>
                    <span
                      className={`mt-1 text-[11px] leading-none ${
                        selected ? 'font-semibold text-emerald-900' : 'text-moss'
                      }`}
                    >
                      {m.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {mood ? (
              <div className="mt-3">
                <p id={pathLabelId} className="mb-2 text-[13px] font-semibold text-bark/80">
                  Today I’ll grow in…
                </p>
                <div role="group" aria-labelledby={pathLabelId} className="flex flex-wrap gap-2">
                  {PATHS.map((p) => {
                    const selected = path === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPath(p)}
                        className={`min-h-[36px] rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
                          selected ? 'bg-leaf text-white' : 'bg-subtle text-bark/80 hover:bg-[#E0D8C6]'
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={finish}
                  disabled={!path}
                  className="mt-3 min-h-[44px] w-full rounded-[14px] bg-leaf text-[15px] font-semibold text-white transition-colors hover:bg-leaf-hover disabled:cursor-not-allowed disabled:bg-leaf/45"
                >
                  Done
                </button>
              </div>
            ) : (
              <p className="mt-3 text-center text-xs text-moss">Tap how you feel. It’s a demo, nothing is saved.</p>
            )}
          </>
        ) : null}

        {done ? (
          <div
            ref={resultRef}
            tabIndex={-1}
            className="is-sprouted mt-3 flex flex-col items-start gap-3 rounded-2xl outline-none"
          >
            <span className="sprout-pill inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[13px] font-semibold text-emerald-900">
              <span aria-hidden="true">✓</span> Checked in · 1-day streak · {path}
            </span>
            <button
              type="button"
              onClick={reset}
              className="min-h-[32px] text-[13px] font-semibold text-leaf underline decoration-leaf/30 underline-offset-4 hover:decoration-leaf"
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>

      {/* The seed. It sprouts when you check in. */}
      <div className="mt-auto flex justify-center pt-6">
        <Seedling sprouted={done} />
      </div>
    </div>
  );
}
