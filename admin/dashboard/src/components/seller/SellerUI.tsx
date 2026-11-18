/**
 * Seller-portal building blocks: loading / empty / error / coming-soon states, modal,
 * toasts, pagination, segmented control, icon buttons, stat tiles and a tiny SVG chart.
 * Cream + emerald Grow! styling; everything keyboard- and screen-reader friendly.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Hourglass,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';

// ---------------------------------------------------------------------------
// States

export function LoadingBlock({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-10 w-10 shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function EmptyBlock({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="rounded-full bg-brand-50 p-4 ring-1 ring-brand-100">
        <Icon className="h-7 w-7 text-brand-600/80" aria-hidden />
      </div>
      <p className="mt-4 font-semibold text-stone-800">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-stone-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="rounded-full bg-red-50 p-4 ring-1 ring-red-100">
        <AlertCircle className="h-7 w-7 text-red-500" aria-hidden />
      </div>
      <p className="mt-4 font-semibold text-stone-800">We couldn’t load this</p>
      <p className="mt-1 max-w-md text-sm text-stone-500">{message}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

export function ComingSoonBlock({ feature }: { feature: string }) {
  return (
    <EmptyBlock
      icon={Hourglass}
      title={`${feature} is on its way`}
      description="This part of Grow! for business is rolling out now. Check back soon — nothing for you to set up yet."
    />
  );
}

export function InlineNotice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'success'; children: ReactNode }) {
  const styles = {
    info: 'border-brand-100 bg-brand-50 text-brand-700',
    warn: 'border-amber-200 bg-amber-50 text-amber-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Controls

export function IconButton({
  label,
  icon: Icon,
  onClick,
  tone = 'default',
  disabled,
  busy,
}: {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || busy}
      onClick={onClick}
      className={`focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        tone === 'danger' ? 'text-red-500 hover:bg-red-50' : 'text-stone-500 hover:bg-surface-page hover:text-stone-800'
      }`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
    </button>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="focus-ring w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-600"
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-surface-border bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`focus-ring whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? 'bg-brand-600 text-white shadow-sm' : 'text-stone-600 hover:bg-surface-page'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const PAGE_SIZE = 25;

export function Pagination({
  page,
  total,
  pageSize = PAGE_SIZE,
  onChange,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) {
    return total > 0 ? (
      <p className="border-t border-surface-border px-4 py-3 text-xs text-stone-500">
        {total} {total === 1 ? 'item' : 'items'}
      </p>
    ) : null;
  }
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-surface-border px-4 py-3">
      <p className="text-xs text-stone-500">
        {from}–{to} of {total}
      </p>
      <div className="flex items-center gap-1">
        <IconButton label="Previous page" icon={ChevronLeft} disabled={page <= 1} onClick={() => onChange(page - 1)} />
        <span className="px-2 text-xs font-medium text-stone-600">
          Page {page} of {pages}
        </span>
        <IconButton label="Next page" icon={ChevronRight} disabled={page >= pages} onClick={() => onChange(page + 1)} />
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Modal

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  description,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  description?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Depends on `open` only, so parent re-renders never steal focus from inputs.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => panelRef.current?.focus(), 10);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      prev?.focus?.();
    };
  }, [open]);
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-stone-900/45 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.18 }}
            className={`relative z-10 flex max-h-[92vh] w-full ${width} flex-col rounded-t-2xl border border-surface-border bg-surface shadow-xl outline-none sm:rounded-2xl`}
          >
            <div className="flex items-start justify-between gap-4 border-b border-surface-border px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
                {description && <p className="mt-0.5 text-sm text-stone-500">{description}</p>}
              </div>
              <IconButton label="Close" icon={X} onClick={onClose} />
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border px-5 py-3">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Toasts

type Toast = { id: number; message: string; tone: 'success' | 'error' };
const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3500);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,360px)] flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg ${
                t.tone === 'error'
                  ? 'border-red-200 bg-white text-red-800'
                  : 'border-emerald-200 bg-white text-emerald-800'
              }`}
            >
              {t.tone === 'error' ? (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              )}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

// ---------------------------------------------------------------------------
// Stats + chart

export function StatTile({
  label,
  value,
  delta,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  hint?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-stone-500">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-brand-600" aria-hidden />}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-stone-900 tabular-nums">{value}</p>
      {delta !== undefined && (
        <p className="mt-1 text-xs text-stone-500">
          {delta === null ? (
            'No earlier data yet'
          ) : (
            <span className={`inline-flex items-center gap-0.5 font-medium ${delta >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
              {delta >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
              {delta > 0 ? '+' : ''}
              {delta}% <span className="font-normal text-stone-500">vs previous</span>
            </span>
          )}
        </p>
      )}
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export type ChartSeries = { key: string; label: string; color: string };

/** Grouped daily bars in plain SVG (no chart library). */
export function DailyBars<T extends { day: string }>({
  data,
  series,
  height = 180,
  label,
}: {
  data: T[];
  series: ChartSeries[];
  height?: number;
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = (d: T, key: string) => Number((d as unknown as Record<string, unknown>)[key] || 0);
  const max = Math.max(1, ...data.flatMap((d) => series.map((s) => values(d, s.key))));
  const w = 100 / Math.max(1, data.length);
  const barW = (w * 0.78) / series.length;
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));
  const active = hover !== null ? data[hover] : null;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-stone-600">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
        <span className="ml-auto min-h-[1rem] text-stone-500" aria-live="polite">
          {active
            ? `${active.day}: ${series.map((s) => `${values(active, s.key)} ${s.label.toLowerCase()}`).join(' · ')}`
            : ''}
        </span>
      </div>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 100 ${height / 3}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        onMouseLeave={() => setHover(null)}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2="100" y1={(height / 3) * f} y2={(height / 3) * f} stroke="#E7E5E4" strokeWidth="0.15" />
        ))}
        {data.map((d, i) => (
          <g key={d.day} onMouseEnter={() => setHover(i)}>
            <rect x={i * w} y={0} width={w} height={height / 3} fill={hover === i ? '#F3EEE4' : 'transparent'} />
            {series.map((s, j) => {
              const v = values(d, s.key);
              const h = (v / max) * (height / 3 - 1);
              return (
                <rect
                  key={s.key}
                  x={i * w + w * 0.11 + j * barW}
                  y={height / 3 - h}
                  width={Math.max(0.2, barW - 0.15)}
                  height={Math.max(v > 0 ? 0.4 : 0, h)}
                  rx="0.3"
                  fill={s.color}
                />
              );
            })}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex text-[10px] text-stone-400">
        {data.map((d, i) => (
          <span key={d.day} className="overflow-visible whitespace-nowrap text-center" style={{ width: `${w}%` }}>
            {i % labelEvery === 0 ? d.day.slice(5) : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
