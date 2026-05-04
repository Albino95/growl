import type { Order } from '../services/api/marketplace';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfBusinessPeriod(period: 'today' | 'week' | 'month'): number {
  const now = new Date();
  if (period === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (period === 'week') {
    return Date.now() - 7 * DAY_MS;
  }
  return Date.now() - 30 * DAY_MS;
}

export function bucketOrdersByDay(orders: Order[], days: number): { label: string; count: number }[] {
  const rows: { key: string; label: string; count: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    rows.push({ key, label: key.slice(5).replace('-', '/'), count: 0 });
  }
  for (const o of orders) {
    const day = new Date(o.created_at).toISOString().slice(0, 10);
    const row = rows.find((r) => r.key === day);
    if (row) row.count += 1;
  }
  return rows.map(({ label, count }) => ({ label, count }));
}
