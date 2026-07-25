'use client';

import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import WaitlistForm from './WaitlistForm';
import { getAppStoreUrl, getPlayStoreUrl } from '@/lib/seo';

const HeroScene = dynamic(() => import('./HeroScene'), {
  ssr: false,
  loading: () => <div className="h-full w-full hero-mesh" aria-hidden />,
});

export default function Hero() {
  const prefersReduced = useReducedMotion();
  const [webglOk, setWebglOk] = useState(true);
  const [showScene, setShowScene] = useState(false);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const ok = !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
      setWebglOk(ok);
    } catch {
      setWebglOk(false);
    }
    const t = window.setTimeout(() => setShowScene(true), 80);
    return () => window.clearTimeout(t);
  }, []);

  const appStore = getAppStoreUrl();
  const playStore = getPlayStoreUrl();

  return (
    <header className="relative isolate min-h-[100svh] overflow-hidden text-white">
      <div className="absolute inset-0 hero-mesh" aria-hidden />
      {showScene && webglOk && !prefersReduced ? (
        <div className="absolute inset-0 opacity-90" aria-hidden>
          <HeroScene reducedMotion={false} />
        </div>
      ) : null}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0c1f17]/92 via-[#0c1f17]/55 to-transparent"
        aria-hidden
      />

      <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-center px-6 pb-24 pt-28 sm:px-8 lg:px-10">
        <motion.p
          initial={prefersReduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="font-display text-[clamp(3.5rem,14vw,8.5rem)] font-extrabold leading-[0.9] tracking-tight text-white"
        >
          Grow<span className="text-emerald-400">!</span>
        </motion.p>

        <motion.h1
          initial={prefersReduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="mt-6 max-w-xl font-display text-2xl font-semibold tracking-tight text-emerald-50 sm:text-3xl lg:text-4xl"
        >
          Grow by scrolling with purpose.
        </motion.h1>

        <motion.p
          initial={prefersReduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.14 }}
          className="mt-4 max-w-lg text-base leading-relaxed text-emerald-100/85 sm:text-lg"
        >
          Interest-based feeds, peer instructors, and a curated marketplace — so every scroll
          pushes you forward.
        </motion.p>

        <motion.div
          initial={prefersReduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.2 }}
          className="mt-10 flex flex-col gap-6"
        >
          <div className="flex flex-wrap gap-3">
            <a
              href={appStore}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-white px-5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-50"
            >
              Download on the App Store
            </a>
            <a
              href={playStore}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/30 bg-white/10 px-5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/15"
            >
              Get it on Google Play
            </a>
          </div>

          <div className="relative">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-emerald-200/80">
              Or join the early access list
            </p>
            <WaitlistForm variant="hero" />
          </div>
        </motion.div>
      </div>
    </header>
  );
}
