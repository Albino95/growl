'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { GROWTH_PATHS } from '@/lib/content';

const pillars = [
  {
    title: 'Discover',
    body: 'A feed shaped by the paths you care about — fitness, mindset, art, nutrition — not empty noise.',
  },
  {
    title: 'Connect',
    body: 'Follow peers and instructors who share your growth categories. Community that keeps you accountable.',
  },
  {
    title: 'Improve',
    body: 'Shop curated tools and programs from trusted sellers. Turn inspiration into action.',
  },
];

const features = [
  {
    title: 'Purpose-built feed',
    body: 'Scroll content that matches your growth paths — posts, stories, and clips from people on the same journey.',
  },
  {
    title: 'Peer instructors',
    body: 'Instructors are earned through community endorsement, not bought ads. Learn from people who prove it daily.',
  },
  {
    title: 'Growth marketplace',
    body: 'Physical goods and programs from brands aligned with how you want to grow — checkout when you are ready.',
  },
];

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
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
      <p className="mt-12 max-w-4xl font-display text-2xl font-semibold leading-relaxed tracking-tight text-emerald-950 sm:text-3xl">
        {GROWTH_PATHS.map((path, i) => (
          <span key={path}>
            {path}
            {i < GROWTH_PATHS.length - 1 ? (
              <span className="mx-2 text-emerald-500/50" aria-hidden>
                ·
              </span>
            ) : null}
          </span>
        ))}
      </p>
    );
  }

  return (
    <div className="path-marquee mt-14 overflow-hidden" aria-label="Growth paths">
      <div className="path-marquee-track gap-0">
        {loop.map((path, i) => (
          <span
            key={`${path}-${i}`}
            className="inline-flex items-center font-display text-3xl font-semibold tracking-tight text-emerald-950 sm:text-4xl"
          >
            <span className="px-4 sm:px-6">{path}</span>
            <span className="text-emerald-500/45" aria-hidden>
              ·
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function FeatureSections() {
  return (
    <>
      <section id="about" className="bg-[var(--surface)] px-6 py-24 sm:px-8 sm:py-28 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
              What Grow! is
            </p>
            <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
              A social platform where scrolling makes you better.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone-600">
              Grow! connects interest-based content, peer-earned instructors, and a curated
              marketplace — so your time online compounds into real progress.
            </p>
          </Reveal>
        </div>
      </section>

      <section
        id="how"
        className="relative overflow-hidden bg-[#0c1f17] px-6 py-24 text-white sm:px-8 sm:py-28 lg:px-10"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 55% 45% at 85% 15%, rgba(5,150,105,0.38), transparent 55%), radial-gradient(ellipse 40% 35% at 10% 80%, rgba(52,211,153,0.12), transparent 50%)',
          }}
          aria-hidden
        />
        <div className="relative mx-auto max-w-6xl">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-300">
              How it works
            </p>
            <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-[2.75rem]">
              Three beats. One habit.
            </h2>
          </Reveal>
          <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-10">
            {pillars.map((item, i) => (
              <Reveal key={item.title} delay={i * 0.1}>
                <div className="md:border-l md:border-emerald-500/20 md:pl-6">
                  <p className="font-display text-6xl font-extrabold leading-none text-emerald-500/30">
                    0{i + 1}
                  </p>
                  <h3 className="mt-4 font-display text-xl font-bold tracking-tight">{item.title}</h3>
                  <p className="mt-3 text-base leading-relaxed text-emerald-50/75">{item.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="paths" className="bg-[#e7f7ef] px-6 py-24 sm:px-8 sm:py-28 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Growth paths
            </p>
            <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
              Pick the directions that matter to you.
            </h2>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-stone-600">
              Your feed follows the paths you choose — not an algorithm optimized for outrage.
            </p>
          </Reveal>
          <Reveal delay={0.12}>
            <PathMarquee />
          </Reveal>
        </div>
      </section>

      <section id="features" className="bg-[var(--surface)] px-6 py-24 sm:px-8 sm:py-28 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Instructors & marketplace
            </p>
            <h2 className="mt-4 max-w-2xl font-display text-3xl font-bold tracking-tight text-stone-900 sm:text-4xl lg:text-[2.75rem] lg:leading-tight">
              Built for people who want progress, not performance theater.
            </h2>
          </Reveal>
          <div className="mt-16 grid gap-12 md:grid-cols-3 md:gap-10">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 0.1}>
                <div className="border-t border-emerald-800/15 pt-7">
                  <h3 className="font-display text-xl font-bold tracking-tight text-stone-900">
                    {f.title}
                  </h3>
                  <p className="mt-3 text-base leading-relaxed text-stone-600">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
