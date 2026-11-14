import { motion } from 'framer-motion';
import type { HTMLAttributes, ReactNode } from 'react';

type Props = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  hover?: boolean;
  padding?: 'sm' | 'md' | 'lg';
};

const paddingMap = { sm: 'p-4', md: 'p-5', lg: 'p-6' };

export function Card({ children, hover, padding = 'md', className = '', ...props }: Props) {
  const baseClass = `rounded-xl border border-surface-border bg-surface shadow-card ${paddingMap[padding]} ${className}`;

  if (hover) {
    return (
      <motion.div
        className={baseClass}
        whileHover={{ y: -2, boxShadow: '0 8px 20px -8px rgb(28 25 23 / 0.12)' }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div className={baseClass} {...props}>
      {children}
    </div>
  );
}
