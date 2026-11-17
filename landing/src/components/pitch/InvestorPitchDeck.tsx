'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from 'framer-motion';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { PITCH_SLIDES, type PitchSlide } from '@/lib/pitchSlides';

const ease = [0.22, 1, 0.36, 1] as const;

function slideVariants(dir: number, reduced: boolean | null): Variants {
  if (reduced) {
    return {
      enter: { opacity: 0 },
      center: { opacity: 1 },
      exit: { opacity: 0 },
    };
  }
  return {
    enter: {
      x: dir > 0 ? 72 : -72,
      opacity: 0,
      scale: 0.985,
      filter: 'blur(6px)',
    },
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      filter: 'blur(0px)',
      transition: { duration: 0.55, ease },
    },
    exit: {
      x: dir > 0 ? -56 : 56,
      opacity: 0,
      scale: 0.99,
      filter: 'blur(4px)',
      transition: { duration: 0.35, ease },
    },
  };
}

const stagger: Variants = {
  center: {
    transition: { staggerChildren: 0.07, delayChildren: 0.08 },
  },
};

const item: Variants = {
  enter: { opacity: 0, y: 18 },
  center: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease },
  },
};

function Kicker({ children }: { children: string }) {
  return (
    <motion.p
      variants={item}
      className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--energy)]"
    >
      {children}
    </motion.p>
  );
}

function Title({ children }: { children: string }) {
  return (
    <motion.h1
      variants={item}
      className="mt-3 max-w-4xl font-display text-[clamp(1.55rem,3.6vw,2.55rem)] font-bold leading-[1.12] tracking-tight text-stone-900 whitespace-pre-line"
    >
      {children}
    </motion.h1>
  );
}

function Lead({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <motion.p variants={item} className="mt-4 max-w-3xl text-base leading-relaxed text-stone-600 sm:text-lg">
      {children}
    </motion.p>
  );
}

function Card({
  title,
  body,
  accent = 'brand',
  children,
}: {
  title: string;
  body?: string;
  accent?: 'brand' | 'energy';
  children?: React.ReactNode;
}) {
  const bar = accent === 'energy' ? 'bg-[var(--energy)]' : 'bg-[var(--brand)]';
  return (
    <motion.div
      variants={item}
      className="relative overflow-hidden rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5 shadow-[0_1px_0_rgba(28,25,23,0.04)]"
    >
      <div className={`absolute left-0 top-0 h-full w-1 ${bar}`} />
      <p className="font-display text-base font-bold text-stone-900 sm:text-lg">{title}</p>
      {body ? <p className="mt-2 text-sm leading-relaxed text-stone-600">{body}</p> : null}
      {children}
    </motion.div>
  );
}

function SlideBody({ slide }: { slide: PitchSlide }) {
  switch (slide.kind) {
    case 'cover':
    case 'close':
      return (
        <motion.div variants={stagger} initial="enter" animate="center" className="flex flex-col justify-center py-2">
          <div className="flex items-center gap-4">
            <motion.div variants={item} className="relative h-16 w-16 overflow-hidden rounded-2xl shadow-lg shadow-emerald-900/15">
              <Image src="/app-icon.png" alt="" fill sizes="64px" className="object-cover" priority />
            </motion.div>
            {slide.kicker || slide.meta ? (
              <Kicker>{slide.kicker || slide.meta || ''}</Kicker>
            ) : null}
          </div>
          <motion.p
            variants={item}
            className="mt-8 font-display text-[clamp(3rem,10vw,6rem)] font-extrabold leading-none tracking-tight text-stone-900"
          >
            Grow<span className="text-[var(--energy)]">!</span>
          </motion.p>
          <motion.p variants={item} className="mt-5 max-w-xl text-xl text-stone-600 sm:text-2xl">
            {slide.subtitle}
          </motion.p>
          {slide.meta && slide.kind === 'cover' ? (
            <motion.p variants={item} className="mt-6 text-sm font-medium text-stone-500">
              {slide.meta}
            </motion.p>
          ) : null}
          {slide.body?.map((p) => (
            <motion.p key={p.slice(0, 40)} variants={item} className="mt-5 max-w-2xl text-base leading-relaxed text-stone-600">
              {p}
            </motion.p>
          ))}
          {slide.kind === 'close' ? (
            <motion.p variants={item} className="mt-10 text-sm uppercase tracking-[0.2em] text-stone-400">
              {slide.meta || 'Thank you'}
            </motion.p>
          ) : null}
        </motion.div>
      );

    case 'prose':
      return (
        <motion.div variants={stagger} initial="enter" animate="center" className="py-2">
          <Kicker>{slide.kicker}</Kicker>
          <Title>{slide.title}</Title>
          <Lead>{slide.lead}</Lead>
          <div className="mt-6 max-w-3xl space-y-4">
            {slide.paragraphs.map((p) => (
              <motion.p key={p.slice(0, 48)} variants={item} className="text-base leading-relaxed text-stone-700">
                {p}
              </motion.p>
            ))}
          </div>
        </motion.div>
      );

    case 'split':
      return (
        <motion.div variants={stagger} initial="enter" animate="center" className="py-2">
          <Kicker>{slide.kicker}</Kicker>
          <Title>{slide.title}</Title>
          <Lead>{slide.lead}</Lead>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card title={slide.left.label} body={slide.left.body} accent={slide.left.tone} />
            <Card title={slide.right.label} accent={slide.right.tone}>
              <ul className="mt-3 space-y-2.5">
                {slide.right.items.map((line) => (
                  <li key={line} className="flex gap-2 text-sm leading-relaxed text-stone-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--energy)]" />
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </motion.div>
      );

    case 'pillars':
      return (
        <motion.div variants={stagger} initial="enter" animate="center" className="py-2">
          <Kicker>{slide.kicker}</Kicker>
          <Title>{slide.title}</Title>
          <Lead>{slide.lead}</Lead>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {slide.pillars.map((p, i) => (
              <Card key={p.title} title={p.title} body={p.body} accent={i === 2 ? 'energy' : 'brand'} />
            ))}
          </div>
        </motion.div>
      );

    case 'steps':
      return (
        <motion.div variants={stagger} initial="enter" animate="center" className="py-2">
          <Kicker>{slide.kicker}</Kicker>
          <Title>{slide.title}</Title>
          <Lead>{slide.lead}</Lead>
          <div className="mt-8 flex flex-wrap gap-3">
            {slide.steps.map((step, i) => (
              <motion.div
                key={step}
                variants={item}
                className={`rounded-2xl px-5 py-3 font-display text-sm font-bold text-white ${
                  i === slide.steps.length - 1 ? 'bg-[var(--energy)]' : 'bg-[var(--brand)]'
                }`}
              >
                {step}
              </motion.div>
            ))}
          </div>
          <motion.p variants={item} className="mt-8 max-w-3xl text-sm leading-relaxed text-stone-600">
            {slide.note}
          </motion.p>
        </motion.div>
      );

    case 'cards':
      return (
        <motion.div variants={stagger} initial="enter" animate="center" className="py-2">
          <Kicker>{slide.kicker}</Kicker>
          <Title>{slide.title}</Title>
          <Lead>{slide.lead}</Lead>
          <div
            className={`mt-6 grid gap-4 ${
              slide.cards.length > 3 ? 'md:grid-cols-2' : 'md:grid-cols-3'
            }`}
          >
            {slide.cards.map((c) => (
              <Card key={c.title} title={c.title} body={c.body} accent={c.accent || 'brand'} />
            ))}
          </div>
        </motion.div>
      );

    case 'metrics':
      return (
        <motion.div variants={stagger} initial="enter" animate="center" className="py-2">
          <Kicker>{slide.kicker}</Kicker>
          <Title>{slide.title}</Title>
          <Lead>{slide.lead}</Lead>
          <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {slide.metrics.map((m) => (
              <motion.div
                key={m.label}
                variants={item}
                className="rounded-2xl border border-stone-200/80 bg-[var(--surface-elevated)] p-5"
              >
                <p className="font-display text-2xl font-extrabold tracking-tight text-[var(--brand)] sm:text-3xl">
                  {m.value}
                </p>
                <p className="mt-2 text-xs font-medium leading-snug text-stone-500">{m.label}</p>
              </motion.div>
            ))}
          </div>
          {slide.note ? (
            <motion.p variants={item} className="mt-6 max-w-3xl text-sm leading-relaxed text-stone-500">
              {slide.note}
            </motion.p>
          ) : null}
        </motion.div>
      );

    case 'bullets':
      return (
        <motion.div variants={stagger} initial="enter" animate="center" className="py-2">
          <Kicker>{slide.kicker}</Kicker>
          <Title>{slide.title}</Title>
          <Lead>{slide.lead}</Lead>
          <ul className="mt-6 max-w-3xl space-y-3">
            {slide.bullets.map((b) => (
              <motion.li
                key={b.slice(0, 60)}
                variants={item}
                className="flex gap-3 border-b border-stone-200/70 pb-3 text-sm leading-relaxed text-stone-700 last:border-0 sm:text-base"
              >
                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[var(--brand)]" />
                {b}
              </motion.li>
            ))}
          </ul>
        </motion.div>
      );

    case 'dual':
      return (
        <motion.div variants={stagger} initial="enter" animate="center" className="py-2">
          <Kicker>{slide.kicker}</Kicker>
          <Title>{slide.title}</Title>
          <Lead>{slide.lead}</Lead>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card title={slide.left.label} accent="brand">
              <ul className="mt-3 space-y-2">
                {slide.left.items.map((line) => (
                  <li key={line} className="text-sm leading-relaxed text-stone-700">
                    · {line}
                  </li>
                ))}
              </ul>
            </Card>
            <Card title={slide.right.label} accent="energy">
              <ul className="mt-3 space-y-2">
                {slide.right.items.map((line) => (
                  <li key={line} className="text-sm leading-relaxed text-stone-700">
                    · {line}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </motion.div>
      );

    case 'ask':
      return (
        <motion.div variants={stagger} initial="enter" animate="center" className="py-2">
          <Kicker>{slide.kicker}</Kicker>
          <Title>{slide.title}</Title>
          <Lead>{slide.lead}</Lead>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div variants={item} className="rounded-3xl bg-[var(--brand)] p-7 text-[var(--surface)] sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100/80">
                Discussion range
              </p>
              <p className="mt-3 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
                {slide.amount}
              </p>
              <p className="mt-4 max-w-md text-sm leading-relaxed text-emerald-50/90">
                {slide.amountNote}
              </p>
            </motion.div>
            <Card title="Use of funds" accent="energy">
              <ul className="mt-3 space-y-2">
                {slide.uses.map((u) => (
                  <li key={u} className="text-sm leading-relaxed text-stone-700">
                    · {u}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm font-semibold text-stone-900">{slide.contact}</p>
            </Card>
          </div>
          {slide.diligence && slide.diligence.length > 0 ? (
            <motion.div variants={item} className="mt-6 max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">
                Before diligence
              </p>
              <ul className="mt-3 space-y-2">
                {slide.diligence.map((d) => (
                  <li key={d} className="text-sm leading-relaxed text-stone-600">
                    · {d}
                  </li>
                ))}
              </ul>
            </motion.div>
          ) : null}
        </motion.div>
      );

    default:
      return null;
  }
}

export default function InvestorPitchDeck() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const total = PITCH_SLIDES.length;
  const slide = PITCH_SLIDES[index];
  const progress = useMemo(() => ((index + 1) / total) * 100, [index, total]);

  const go = useCallback(
    (next: number) => {
      setDir(next > index ? 1 : -1);
      setIndex(Math.max(0, Math.min(total - 1, next)));
    },
    [index, total]
  );

  const next = useCallback(() => go(index + 1), [go, index]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        go(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        go(total - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, next, prev, total]);

  const variants = slideVariants(dir, reduced);

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[var(--surface)] text-stone-900">
      <div className="pointer-events-none absolute inset-0 hero-atmosphere opacity-90" aria-hidden />
      <div className="pointer-events-none absolute inset-0 page-grain" aria-hidden />

      <header className="relative z-20 flex items-center justify-between px-5 py-4 sm:px-8">
        <Link
          href="/"
          className="font-display text-sm font-bold tracking-tight text-stone-800 transition hover:text-[var(--brand)]"
        >
          Grow<span className="text-[var(--energy)]">!</span>
          <span className="ml-2 text-xs font-medium text-stone-400">Pitch</span>
        </Link>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
          Confidential
        </p>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-7.5rem)] max-w-6xl flex-col px-5 pb-6 sm:px-8">
        <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="wait" custom={dir}>
            <motion.section
              key={slide.id}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              className="min-h-full py-2"
            >
              <SlideBody slide={slide} />
            </motion.section>
          </AnimatePresence>
        </div>

        <footer className="mt-auto flex flex-col gap-4 pt-2">
          <div className="h-1 overflow-hidden rounded-full bg-stone-200/80">
            <motion.div
              className="h-full rounded-full bg-[var(--brand)]"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.4, ease }}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={prev}
              disabled={index === 0}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white/70 px-4 py-2 text-sm font-semibold text-stone-800 backdrop-blur transition enabled:hover:border-[var(--brand)] enabled:hover:text-[var(--brand)] disabled:opacity-35"
              aria-label="Previous slide"
            >
              <CaretLeft weight="bold" className="h-4 w-4" />
              Back
            </button>

            <div className="hidden items-center gap-1.5 sm:flex" aria-hidden>
              {PITCH_SLIDES.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(i)}
                  className={`h-1.5 rounded-full transition-all ${
                    i === index
                      ? 'w-6 bg-[var(--energy)]'
                      : 'w-1.5 bg-stone-300 hover:bg-stone-400'
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            <p className="font-mono text-xs text-stone-400 tabular-nums sm:min-w-[4.5rem] sm:text-center">
              {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </p>

            <button
              type="button"
              onClick={next}
              disabled={index === total - 1}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white transition enabled:hover:bg-[var(--brand-deep)] disabled:opacity-35"
              aria-label="Next slide"
            >
              Next
              <CaretRight weight="bold" className="h-4 w-4" />
            </button>
          </div>

          <p className="text-center text-[11px] text-stone-400">
            Arrow keys · Space · click sides to navigate
          </p>
        </footer>
      </div>
    </div>
  );
}
