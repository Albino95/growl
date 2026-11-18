import { useCallback, useEffect, useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { errorMessage, listCustomers, type Customer } from '../../services/api/sellerApi';
import { formatDate, formatEur } from '../../lib/sellerFormat';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Select } from '../../components/ui/Input';
import {
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  PAGE_SIZE,
  Pagination,
  SearchField,
} from '../../components/seller/SellerUI';

type Sort = 'recent' | 'spent' | 'orders' | 'name';

export function SellerCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setCustomers(await listCustomers());
    } catch (e) {
      setError(errorMessage(e, 'Failed to load customers'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = customers.filter((c) => !q || `${c.username} ${c.email}`.toLowerCase().includes(q));
    const by: Record<Sort, (a: Customer, b: Customer) => number> = {
      recent: (a, b) => (b.last_order_at || '').localeCompare(a.last_order_at || ''),
      spent: (a, b) => b.total_spent - a.total_spent,
      orders: (a, b) => b.order_count - a.order_count,
      name: (a, b) => a.username.localeCompare(b.username),
    };
    return [...list].sort(by[sort]);
  }, [customers, query, sort]);

  useEffect(() => setPage(1), [query, sort]);

  const repeat = customers.filter((c) => c.order_count > 1).length;
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title="Customers" subtitle="People who have bought from you. Use their details only to fulfil and support their orders." />
      {!loading && !error && customers.length > 0 && (
        <p className="mb-4 text-sm text-stone-600">
          {customers.length} {customers.length === 1 ? 'customer' : 'customers'} · {repeat} came back for more
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField value={query} onChange={setQuery} placeholder="Search name or email…" label="Search customers" />
        <Select aria-label="Sort customers" className="!w-auto" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="recent">Most recent order</option>
          <option value="spent">Spent the most</option>
          <option value="orders">Most orders</option>
          <option value="name">Name A–Z</option>
        </Select>
      </div>
      <Card className="overflow-hidden !p-0">
        {loading ? (
          <LoadingBlock />
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => void load()} />
        ) : customers.length === 0 ? (
          <EmptyBlock
            icon={Users}
            title="No customers yet"
            description="Checkout is paused in the app for now. People who save your products show up in Insights."
          />
        ) : filtered.length === 0 ? (
          <EmptyBlock title="No customers match" description="Try a different search." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-xs font-semibold uppercase tracking-wide text-stone-500">
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3 text-right">Orders</th>
                    <th className="px-4 py-3 text-right">Spent</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Last order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {pageRows.map((c) => (
                    <tr key={c.user_id} className="hover:bg-surface-page/80">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {c.avatar ? (
                            <img src={c.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700" aria-hidden>
                              {c.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-medium">{c.username}</p>
                            <p className="truncate text-xs text-stone-500">{c.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{c.order_count}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatEur(c.total_spent)}</td>
                      <td className="hidden px-4 py-3 text-stone-600 sm:table-cell">{formatDate(c.last_order_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} onChange={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
