import type { Variants } from 'framer-motion';

const reduced =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const pageFade: Variants = {
  initial: { opacity: 0, y: reduced ? 0 : 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, y: reduced ? 0 : -6, transition: { duration: 0.15 } },
};

export const staggerContainer: Variants = {
  animate: {
    transition: { staggerChildren: reduced ? 0 : 0.06 },
  },
};

export const staggerItem: Variants = {
  initial: { opacity: 0, y: reduced ? 0 : 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

export const modalOverlay: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const modalPanel: Variants = {
  initial: { opacity: 0, scale: reduced ? 1 : 0.95, y: reduced ? 0 : 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { opacity: 0, scale: reduced ? 1 : 0.97, transition: { duration: 0.15 } },
};

export const slideOver: Variants = {
  initial: { x: reduced ? 0 : '100%' },
  animate: { x: 0, transition: { type: 'spring', damping: 28, stiffness: 320 } },
  exit: { x: reduced ? 0 : '100%', transition: { duration: 0.2 } },
};
