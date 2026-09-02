'use client';

import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import WaitlistForm from './WaitlistForm';
import {
  getAppStoreUrl,
  getPlayStoreUrl,
  hasLiveAppStoreUrl,
  hasLivePlayStoreUrl,
} from '@/lib/seo';

const HeroScene = dynamic(() => import('./HeroScene'), {
  ssr: false,
  loading: () => <div className="h-full w-full hero-mesh" aria-hidden />,
});

export default function Hero() {
  const prefersReduced = useReducedMotion();
  const [webglOk, setWebglOk] = useState(true);
  const [showScene, setShowScene] = useState(false);
  const [sceneFailed, setSceneFailed] = useState(false);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const ok = !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      setWebglOk(ok);
    } catch {
      setWebglOk(false);
    }
    const t = window.setTimeout(() => setShowScene(true), 60);
    return () => window.clearTimeout(t);
  }, []);

  const appLive = hasLiveAppStoreUrl();
  const playLive = hasLivePlayStoreUrl();
  const appStore = getAppStoreUrl();
  const playStore = getPlayStoreUrl();

  return (
    <header className="relative isolate min-h-[100svh] overflow-hidden text-white">
      <div className="absolute inset-0 hero-mesh" aria-hidden />
      {showScene && webglOk && !prefersReduced && !sceneFailed ? (
        <div className="absolute inset-0 opacity-[0.92]" aria-hidden>
          <HeroScene reducedMotion={false} onError={() => setSceneFailed(true)} />
        </div>
      ) : null}
      <div className="pointer-events-none absolute inset-0 hero-grain" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0c1f17]/95 via-[#0c1f17]/62 to-[#0c1f17]/15 sm:via-[#0c1f17]/50 sm:to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0c1f17] to-transparent"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-6 pb-28 pt-28 sm:px-8 lg:px-10">
        <motion.p
          initial={prefersReduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="font-display text-[clamp(3.75rem,15vw,9rem)] font-extrabold leading-[0.86] tracking-tight text-white"
        >
          Grow<span className="text-emerald-400">!</span>
        </motion.p>

        <motion.h1
          initial={prefersReduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="mt-7 max-w-xl font-display text-2xl font-semibold tracking-tight text-emerald-50 sm:text-3xl lg:text-[2.35rem] lg:leading-tight"
        >
          Grow by scrolling with purpose.
        </motion.h1>

        <motion.p
          initial={prefersReduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 max-w-md text-base leading-relaxed text-emerald-100/85 sm:text-lg"
        >
          Interest-based feeds, vertical reels, peer instructors, and a curated marketplace — so
          every scroll pushes you forward.
        </motion.p>

        <motion.div
          id="early-access-hero"
          initial={prefersReduced ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 flex max-w-lg flex-col gap-5"
        >
          <div>
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/75">
              Early access
            </p>
            <WaitlistForm variant="hero" />
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {appLive ? (
              <a
                href={appStore}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-100/90 underline-offset-4 transition hover:text-white hover:underline"
              >
                App Store
              </a>
            ) : (
              <span className="text-emerald-100/55">App Store · coming soon</span>
            )}
            <span className="text-emerald-500/40" aria-hidden>
              ·
            </span>
            {playLive ? (
              <a
                href={playStore}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-emerald-100/90 underline-offset-4 transition hover:text-white hover:underline"
              >
                Google Play
              </a>
            ) : (
              <span className="text-emerald-100/55">Google Play · coming soon</span>
            )}
          </div>
        </motion.div>
      </div>

      <a
        href="#about"
        className="hero-scroll-cue absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-emerald-100/70 transition hover:text-white"
        aria-label="Scroll to about"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.22em]">Explore</span>
        <span className="block h-8 w-px bg-gradient-to-b from-emerald-200/80 to-transparent" aria-hidden />
      </a>
    </header>
  );
}
