'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Static SVGs rendered on the server and passed in, so they cost no client JS. */
export type DemoArt = {
  check: React.ReactNode;
  chevronDown: React.ReactNode;
  chevronUp: React.ReactNode;
  /** Week strip, Monday done, 7px (pill). */
  dotsDoneSmall: React.ReactNode;
  restCard: React.ReactNode;
  journalNudge: React.ReactNode;
  writeMore: React.ReactNode;
  /** Card header: greeting + week dots, before check-in and while editing. */
  formHead: React.ReactNode;
  formHeadEditing: React.ReactNode;
  /** Reply card content (sprout + warm line + streak), by mood group. */
  reply: Record<ReplyKind, React.ReactNode>;
};

export type ReplyKind = 'honest' | 'steady' | 'energy';

/**
 * The app's Home "Today" card, faithfully redrawn
 * (frontend/src/components/feed/TodayCard.tsx + recap/WeekDots.tsx + recap/growthMeta.ts).
 * form → (Done) → reply → pill, exactly like the app; nothing is saved.
 */
const MOODS = [
  { mood: 1, glyph: '\u{1F327}\u{FE0F}', label: 'Heavy' },
  { mood: 2, glyph: '🌙', label: 'Tired' },
  { mood: 3, glyph: '🙂', label: 'Okay' },
  { mood: 4, glyph: '😊', label: 'Good' },
  { mood: 5, glyph: '⚡', label: 'Bright' },
] as const;

const PATHS = ['Fitness', 'Language Learning', 'Art'] as const;

const REPLY_HOLD_MS = 2400;

type MoodId = (typeof MOODS)[number]['mood'];
type Phase = 'form' | 'reply' | 'pill' | 'rest';

/** growthMeta.moodReply groups: heavy/tired → honest, okay → steady, good/bright → energy. */
function replyKind(mood: MoodId | null): ReplyKind {
  return mood === 3 ? 'steady' : mood && mood > 3 ? 'energy' : 'honest';
}

/**
 * `captionId`: element (server-rendered under the phone) that receives the "Start over" button.
 * The phone frame, status bar, header, feed and dock are server-rendered around this island.
 */
export default function CheckInDemo({ art, captionId }: { art: DemoArt; captionId: string }) {
  const [phase, setPhase] = useState<Phase>('form');
  const [editing, setEditing] = useState(false);
  const [mood, setMood] = useState<MoodId | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [intention, setIntention] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [announce, setAnnounce] = useState('');

  const replyRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLButtonElement>(null);
  const firstMoodRef = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const uid = useId();
  const pathLabelId = `${uid}-path`;

  const [captionEl, setCaptionEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setCaptionEl(document.getElementById(captionId));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [captionId]);

  const moodMeta = MOODS.find((m) => m.mood === mood) ?? null;

  const onDone = () => {
    if (!mood) return;
    setEditing(false);
    setExpanded(false);
    setPhase('reply');
    setAnnounce('Checked in. 1-day streak.');
    requestAnimationFrame(() => replyRef.current?.focus());
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const hadFocus = !!replyRef.current && replyRef.current.contains(document.activeElement);
      setPhase('pill');
      if (hadFocus) requestAnimationFrame(() => pillRef.current?.focus());
    }, REPLY_HOLD_MS);
  };

  const onRest = () => {
    setPhase('rest');
    setAnnounce('Rest day taken. Your streak is safe.');
  };

  const onEdit = () => {
    setEditing(true);
    setPhase('form');
    requestAnimationFrame(() => firstMoodRef.current?.focus());
  };

  const onCancelEdit = () => {
    setEditing(false);
    setPhase('pill');
    requestAnimationFrame(() => pillRef.current?.focus());
  };

  const startOver = () => {
    if (timer.current) clearTimeout(timer.current);
    setPhase('form');
    setEditing(false);
    setMood(null);
    setPath(null);
    setIntention('');
    setExpanded(false);
    setAnnounce('Check-in cleared. How are you arriving today?');
    requestAnimationFrame(() => firstMoodRef.current?.focus());
  };

  const touched = phase !== 'form' || mood !== null || editing;

  let card: React.ReactNode;

  // Styles live in globals.css (.td-*) so the island stays small; values mirror TodayCard.tsx.
  if (phase === 'rest') {
    card = art.restCard;
  } else if (phase === 'reply') {
    card = (
      <div ref={replyRef} tabIndex={-1} className="td-reply">
        {art.reply[replyKind(mood)]}
      </div>
    );
  } else if (phase === 'pill') {
    card = (
      <div className="pill-in mx-4 mb-3">
        <button
          ref={pillRef}
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="td-pill"
        >
          {art.check}
          <span className="td-pill-text">
            Checked in · 1-day streak
            {path ? ` · ${path}` : ''}
          </span>
          {art.dotsDoneSmall}
          {expanded ? art.chevronUp : art.chevronDown}
        </button>

        {expanded ? (
          <div className="td-panel">
            {moodMeta ? (
              <p className="text-xs text-stone-500">
                Arrived feeling {moodMeta.glyph} {moodMeta.label.toLowerCase()}
              </p>
            ) : null}
            {intention.trim() ? (
              <p className="mt-1 text-[15px] leading-5 text-stone-900">“{intention.trim()}”</p>
            ) : (
              <p className="mt-1 text-sm text-stone-500">No intention today — that’s fine.</p>
            )}
            <div className="mt-3 flex gap-2">
              {art.writeMore}
              <button type="button" onClick={onEdit} className="td-edit">
                Edit
              </button>
            </div>
          </div>
        ) : (
          art.journalNudge
        )}
      </div>
    );
  } else {
    card = (
      <div className="td-card">
        {editing ? art.formHeadEditing : art.formHead}

        <div role="group" aria-label="How are you arriving today?" className="mt-3 flex justify-between">
          {MOODS.map((m, i) => (
            <button
              key={m.mood}
              ref={i ? undefined : firstMoodRef}
              type="button"
              aria-pressed={mood === m.mood}
              onClick={() => setMood(m.mood)}
              className="td-mood"
            >
              <span aria-hidden="true">{m.glyph}</span>
              {m.label}
            </button>
          ))}
        </div>

        {mood ? (
          <div className="reveal mt-3">
            <p id={pathLabelId} className="mb-2 text-[13px] font-semibold text-stone-700">
              Today I’ll grow in…
            </p>
            <div role="group" aria-labelledby={pathLabelId} className="flex gap-2 overflow-hidden">
              {PATHS.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={path === p}
                  onClick={() => setPath((cur) => (cur === p ? null : p))}
                  className="td-chip"
                >
                  {p}
                </button>
              ))}
            </div>

            <input
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              maxLength={140}
              placeholder="One small step (optional)"
              aria-label="Intention for today, optional"
              enterKeyHint="done"
              onKeyDown={(e) => e.key === 'Enter' && onDone()}
              className="td-input"
            />

            <button type="button" onClick={onDone} className="td-done">
              Done
            </button>
          </div>
        ) : null}

        <div className="mt-2.5">
          {editing ? (
            <button type="button" onClick={onCancelEdit} className="td-link text-stone-500">
              Cancel
            </button>
          ) : (
            <button type="button" onClick={onRest} className="td-link text-emerald-700">
              🌿 Rest today · 1 left
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-2">
      <p className="sr-only" aria-live="polite" role="status">
        {announce}
      </p>
      {card}
      {touched && captionEl
        ? createPortal(
            <button
              type="button"
              onClick={startOver}
              className="td-restart"
            >
              Start over
            </button>,
            captionEl
          )
        : null}
    </div>
  );
}
