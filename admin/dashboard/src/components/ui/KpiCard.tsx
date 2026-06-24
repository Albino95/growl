import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';
import { Card } from './Card';
import { staggerItem } from '../../lib/motion';

type Props = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  href?: string;
  hrefLabel?: string;
  accent?: string;
};

export function KpiCard({ label, value, icon: Icon, href, hrefLabel, accent = 'bg-brand-50 text-brand-600' }: Props) {
  return (
    <motion.div variants={staggerItem}>
      <Card hover padding="md" className="h-full">
        <div className="flex items-start justify-between">
          <div className={`rounded-lg p-2.5 ${accent}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        {href && (
          <Link to={href} className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
            {hrefLabel || 'View'} <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </Card>
    </motion.div>
  );
}

export function KpiSkeleton() {
  return (
    <Card padding="md">
      <div className="h-10 w-10 animate-pulse rounded-lg bg-slate-200" />
      <div className="mt-4 h-4 w-24 animate-pulse rounded bg-slate-200" />
      <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200" />
    </Card>
  );
}
