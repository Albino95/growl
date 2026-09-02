'use client';

import Image from 'next/image';
import { motion, useReducedMotion } from 'framer-motion';
import WaitlistForm from './WaitlistForm';
import {
  getAppStoreUrl,
  getPlayStoreUrl,
  hasLiveAppStoreUrl,
  hasLivePlayStoreUrl,
} from '@/lib/seo';

const HERO_IMAGE =
  'https://picsum.photos/seed/grow-purpose-scroll-hero/1400/1800';

export default function Hero() {
  const prefersReduced = useReducedMotion();
  const appLive = hasLiveAppStoreUrl();
  const playLive = hasLivePlayStoreUrl();
  const appStore = getAppStoreUrl();
  const playStore = getPlayStoreUrl();

  return (
    <header className="relative isolate min-h-[100dvh] overflow-hidden">
      <div className="absolute inset-0 hero-atmosphere" aria-hidden />
      <div className="pointer-events-none absolute inset-0 page-grain" aria-hidden />

      <div className="relative z-10 mx-auto grid min-h-[100dvh] max-w-[1400px] grid-cols-1 items-center lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="flex flex-col justify-center px-6 pb-12 pt-24 sm:px-8 sm:pt-28 lg:px-10 lg:pb-20 lg:pt-24">
          <motion.p
            initial={prefersReduced ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="font-display text-[clamp(3.5rem,12vw,7.5rem)] font-extrabold leading-[0.88] tracking-tight text-stone-900"
          >
            Grow<span className="text-emerald-600">!</span>
          </motion.p>

          <motion.h1
            initial={prefersReduced ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="mt-6 max-w-lg font-display text-2xl font-semibold tracking-tight text-stone-800 sm:text-3xl lg:text-[2.15rem] lg:leading-[1.15]"
          >
            Grow by scrolling with purpose.
          </motion.h1>

          <motion.p
            initial={prefersReduced ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            className="mt-4 max-w-md text-base leading-relaxed text-stone-600 sm:text-lg"
          >
            Interest feeds, reels, peer instructors, and a curated marketplace that move you forward.
          </motion.p>

          <motion.div
            id="early-access-hero"
            initial={prefersReduced ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="mt-9 flex max-w-lg flex-col gap-4"
          >
            <WaitlistForm variant="hero" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-500">
              {appLive ? (
                <a
                  href={appStore}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-stone-700 underline-offset-4 transition hover:text-emerald-800 hover:underline"
                >
                  App Store
                </a>
              ) : (
                <span>App Store soon</span>
              )}
              <span className="text-stone-300" aria-hidden>
                /
              </span>
              {playLive ? (
                <a
                  href={playStore}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-stone-700 underline-offset-4 transition hover:text-emerald-800 hover:underline"
                >
                  Google Play
                </a>
              ) : (
                <span>Google Play soon</span>
              )}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={prefersReduced ? false : { opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="relative min-h-[42vh] w-full lg:min-h-[100dvh]"
        >
          <Image
            src={HERO_IMAGE}
            alt="People training outdoors with focus and calm energy"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 48vw"
            className="object-cover object-center"
          />
          <div
            className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--surface)] via-transparent to-transparent lg:bg-gradient-to-l lg:from-transparent lg:via-transparent lg:to-[var(--surface)]/80"
            aria-hidden
          />
        </motion.div>
      </div>
    </header>
  );
}
