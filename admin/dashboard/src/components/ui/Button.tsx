import { motion, type HTMLMotionProps } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'danger' | 'ghost' | 'outline';

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  ghost: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  outline: 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
};

type Props = Omit<HTMLMotionProps<'button'>, 'children'> & {
  variant?: Variant;
  loading?: boolean;
  children: ReactNode;
};

export function Button({ variant = 'primary', loading, disabled, children, className = '', type = 'button', ...props }: Props) {
  return (
    <motion.button
      type={type}
      whileTap={{ scale: 0.98 }}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </motion.button>
  );
}
