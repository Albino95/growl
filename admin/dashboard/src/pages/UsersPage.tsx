import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { adminRequest } from '../services/api/adminClient';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge, statusBadge } from '../components/ui/Badge';
import { DataTable, DataTableHead, DataTableHeaderCell, DataTableBody, DataTableRow, DataTableCell, EmptyState } from '../components/ui/DataTable';
import { TableSkeleton } from '../components/ui/Skeleton';

type UserRow = {
  id: string;
  email: string;
  account_status?: string;
  strike_count?: number;
  created_at: string;
};

const PAGE_SIZE = 50;

export function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setOffset(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (debouncedQ) params.set('q', debouncedQ);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    adminRequest<{ users: UserRow[]; total: number }>(`/admin/users?${params}`)
      .then((res) => {
        setUsers(res.users || []);
        setTotal(res.total ?? 0);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load users'))
      .finally(() => setLoading(false));
  }, [debouncedQ, offset]);

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + users.length, total);
  const subtitle =
    total > 0
      ? `Showing ${from}–${to} of ${total} platform accounts`
      : 'Search and manage platform accounts';

  return (
    <div>
      <PageHeader title="Users" subtitle={subtitle} />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-10" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email, name, or user ID…" />
      </div>

      <Card padding="sm">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={8} cols={4} /></div>
        ) : users.length === 0 ? (
          <EmptyState title="No users found" description="Try a different search term." />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableHeaderCell>User</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell>Strikes</DataTableHeaderCell>
              <DataTableHeaderCell>Joined</DataTableHeaderCell>
            </DataTableHead>
            <DataTableBody>
              {users.map((u) => (
                <DataTableRow key={u.id}>
                  <DataTableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                        {u.email.charAt(0).toUpperCase()}
                      </div>
                      <Link to={`/users/${u.id}`} className="font-medium text-brand-600 hover:text-brand-700">{u.email}</Link>
                    </div>
                  </DataTableCell>
                  <DataTableCell><Badge variant={statusBadge(u.account_status || 'active')}>{u.account_status || 'active'}</Badge></DataTableCell>
                  <DataTableCell>{u.strike_count ?? 0}</DataTableCell>
                  <DataTableCell className="text-slate-500">{new Date(u.created_at).toLocaleDateString()}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </Card>

      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between">
          <Button variant="outline" disabled={offset === 0 || loading} onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>
            Previous
          </Button>
          <span className="text-sm text-slate-500">
            Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <Button
            variant="outline"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
