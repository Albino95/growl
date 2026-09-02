'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChatsCircle, ShoppingBag, UsersThree } from '@phosphor-icons/react';
import { GROWTH_PATHS } from '@/lib/content';

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.65, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

function PathMarquee() {
  const reduced = useReducedMotion();
  const loop = [...GROWTH_PATHS, ...GROWTH_PATHS];

  if (reduced) {
    return (
      <p className="mt-10 max-w-4xl font-display text-2xl font-semibold leading-relaxed tracking-tight text-emerald-950 sm:text-3xl">
        {GROWTH_PATHS.map((path, i) => (
          <span key={path}>
            {path}
            {i < GROWTH_PATHS.length - 1 ? (
              <span className="mx-2 text-emerald-500/45" aria-hidden>
                ·
              </span>
            ) : null}
          </span>
        ))}
      </p>
    );
  }

  return (
    <div className="path-marquee mt-12 overflow-hidden" aria-label="Growth paths">
      <div className="path-marquee-track gap-0">
        {loop.map((path, i) => (
          <span
            key={`${path}-${i}`}
            className="inline-flex items-center font-display text-3xl font-semibold tracking-tight text-emerald-950 sm:text-4xl"
          >
            <span className="px-4 sm:px-6">{path}</span>
            <span className="text-emerald-500/40" aria-hidden>
              ·
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

const moments = [
  {
    title: 'A feed with a job',
    body: 'Posts and stories from people on your paths, not outrage bait.',
    image: 'https://picsum.photos/seed/grow-feed-moment/1200/900',
    span: 'lg:col-span-7',
  },
  {
    title: 'Reels that teach',
    body: 'Vertical clips with looks, text, and sound built for growth.',
    image: 'https://picsum.photos/seed/grow-reels-moment/900/1200',
    span: 'lg:col-span-5',
  },
  {
    title: 'Instructors you trust',
    body: 'Earned by peer endorsements in shared categories.',
    image: 'https://picsum.photos/seed/grow-coach-moment/1100/900',
    span: 'lg:col-span-5',
  },
  {
    title: 'Marketplace that matches',
    body: 'Goods and programs from sellers aligned with your goals.',
    image: 'https://picsum.photos/seed/grow-shop-moment/1200/900',
    span: 'lg:col-span-7',
  },
];

const beats = [
  {
    title: 'Discover',
    body: 'Choose growth paths. Your feed follows those directions.',
    icon: ChatsCircle,
  },
  {
    title: 'Connect',
    body: 'Meet peers and instructors who share your categories.',
    icon: UsersThree,
  },
  {
    title: 'Improve',
    body: 'Act on what you see with tools from the marketplace.',
    icon: ShoppingBag,
  },
];

export default function FeatureSections() {
  return (
    <>
      <section id="about" className="relative bg-[var(--surface)] px-6 py-24 sm:px-8 sm:py-28 lg:px-10">
        <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end lg:gap-16">
          <Reveal>
            <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
              A social platform where scrolling makes you better.
            </h2>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-stone-600">
              Grow! ties interest-based content, peer-earned instructors, and a curated shop into one
              habit. Time online compounds into real progress.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[var(--surface-alt)] sm:aspect-[5/4] lg:aspect-[4/5]">
              <Image
                src="https://picsum.photos/seed/grow-about-focus/1000/1250"
                alt="Focused morning training session"
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
            </div>
          </Reveal>
        </div>
      </section>

      <section id="paths" className="bg-[#e4f4ec] px-6 py-20 sm:px-8 sm:py-24 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-[2.6rem] lg:leading-tight">
              Pick the directions that matter to you.
            </h2>
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-stone-600">
              Your feed follows the paths you choose, not an algorithm optimized for outrage.
            </p>
          </Reveal>
          <Reveal delay={0.08}>
            <PathMarquee />
          </Reveal>
        </div>
      </section>

      <section id="features" className="bg-[var(--surface)] px-6 py-24 sm:px-8 sm:py-28 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="max-w-2xl font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-[2.6rem] lg:leading-tight">
              Built for progress, not performance theater.
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-5 lg:grid-cols-12">
            {moments.map((m, i) => (
              <Reveal key={m.title} delay={i * 0.06} className={`${m.span} group`}>
                <article className="relative overflow-hidden rounded-2xl bg-[var(--surface-elevated)] shadow-[0_12px_40px_rgba(28,25,23,0.06)]">
                  <div
                    className={`relative overflow-hidden ${
                      i % 2 === 1 ? 'aspect-[4/5] sm:aspect-[3/4]' : 'aspect-[16/11]'
                    }`}
                  >
                    <Image
                      src={m.image}
                      alt=""
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover transition duration-700 group-hover:scale-[1.03]"
                    />
                    <div
                      className="absolute inset-0 bg-gradient-to-t from-stone-950/75 via-stone-950/15 to-transparent"
                      aria-hidden
                    />
                    <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7">
                      <h3 className="font-display text-xl font-bold tracking-tight text-white sm:text-2xl">
                        {m.title}
                      </h3>
                      <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/80 sm:text-base">
                        {m.body}
                      </p>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="bg-[var(--surface-alt)] px-6 py-24 sm:px-8 sm:py-28 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-[2.6rem]">
              Three beats. One habit.
            </h2>
          </Reveal>

          <div className="mt-14 space-y-4">
            {beats.map((beat, i) => {
              const Icon = beat.icon;
              return (
                <Reveal key={beat.title} delay={i * 0.07}>
                  <div className="grid items-center gap-4 rounded-2xl border border-stone-900/6 bg-[var(--surface-elevated)] px-5 py-5 sm:grid-cols-[auto_1fr_auto] sm:gap-8 sm:px-7 sm:py-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-700/10 text-emerald-800">
                      <Icon size={26} weight="duotone" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold tracking-tight text-stone-900">
                        {beat.title}
                      </h3>
                      <p className="mt-1.5 max-w-2xl text-base leading-relaxed text-stone-600">
                        {beat.body}
                      </p>
                    </div>
                    {i < beats.length - 1 ? (
                      <ArrowRight
                        size={22}
                        className="hidden text-emerald-700/50 sm:block"
                        aria-hidden
                      />
                    ) : (
                      <span className="hidden sm:block" aria-hidden />
                    )}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
