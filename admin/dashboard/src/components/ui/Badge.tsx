type Variant = 'default' | 'pending' | 'high' | 'success' | 'danger' | 'info';

const styles: Record<Variant, string> = {
  default: 'bg-slate-100 text-slate-700',
  pending: 'bg-amber-100 text-amber-800',
  high: 'bg-red-100 text-red-800',
  success: 'bg-emerald-100 text-emerald-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
};

export function Badge({ children, variant = 'default' }: { children: React.ReactNode; variant?: Variant }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[variant]}`}>
      {children}
    </span>
  );
}

export function statusBadge(status: string): Variant {
  if (['pending', 'investigating'].includes(status)) return 'pending';
  if (['closed', 'completed', 'actioned'].includes(status)) return 'success';
  if (['rejected', 'banned'].includes(status)) return 'danger';
  return 'default';
}

export function priorityBadge(priority: string): Variant {
  if (priority === 'critical' || priority === 'high') return 'high';
  return 'default';
}
