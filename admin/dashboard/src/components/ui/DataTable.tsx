import type { ReactNode } from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="rounded-full bg-emerald-50 p-4 ring-1 ring-emerald-100">
        <Inbox className="h-8 w-8 text-emerald-600/70" />
      </div>
      <p className="mt-4 font-medium text-stone-800">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-stone-500">{description}</p>}
    </div>
  );
}

export function DataTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function DataTableHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {children}
      </tr>
    </thead>
  );
}

export function DataTableBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function DataTableRow({ children }: { children: ReactNode }) {
  return <tr className="transition-colors hover:bg-slate-50/80">{children}</tr>;
}

export function DataTableCell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 align-middle ${className}`}>{children}</td>;
}

export function DataTableHeaderCell({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 font-semibold">{children}</th>;
}
