import { useCallback, useEffect, useState } from 'react';
import { adminRequest, listQuery, type Paged } from '../services/api/adminClient';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { useAdminToast, errorMessage } from '../components/admin/Toast';
import { SearchBar, Pager } from '../components/admin/ListControls';
import { Field, Select } from '../components/ui/Input';
import { TableSkeleton } from '../components/ui/Skeleton';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge, statusBadge } from '../components/ui/Badge';
import { DataTable, DataTableHead, DataTableHeaderCell, DataTableBody, DataTableRow, DataTableCell, EmptyState } from '../components/ui/DataTable';
import { PromptDialog } from '../components/ui/Dialog';

type Appeal = {
  id: string;
  user_id: string;
  status: string;
  action?: string;
  reason_code?: string;
  created_at: string;
};

const PAGE_SIZE = 50;

export function AppealsPage() {
  const { can } = useAdminAuth();
  const toast = useAdminToast();
  const canDecide = can('appeals.write');
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [page, setPage] = useState<Paged>({ total: 0, limit: PAGE_SIZE, offset: 0, has_more: false });
  const [status, setStatus] = useState('pending');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [prompt, setPrompt] = useState<{ id: string; status: 'upheld' | 'overturned' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminRequest<{ appeals: Appeal[] } & Paged>(
        `/admin/moderation/appeals${listQuery({ status, q, limit: PAGE_SIZE, offset })}`
      );
      setAppeals(res.appeals || []);
      setPage(res);
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Failed to load appeals'));
    } finally {
      setLoading(false);
    }
  }, [status, q, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(reasonText: string) {
    if (!prompt) return;
    if (reasonText.trim().length < 3) {
      toast.error('Add a reason of at least 3 characters');
      return;
    }
    setBusyId(prompt.id);
    setError('');
    try {
      await adminRequest(`/admin/moderation/appeals/${prompt.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status: prompt.status, reasonText }),
      });
      toast.success(prompt.status === 'overturned' ? 'Appeal overturned' : 'Appeal upheld');
      await load();
    } catch (e) {
      toast.error(errorMessage(e, 'Decision failed'));
    } finally {
      setBusyId('');
      setPrompt(null);
    }
  }

  return (
    <div>
      <PageHeader title="Appeals" subtitle="Review and decide moderation appeals" />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-48">
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="upheld">Upheld</option>
              <option value="overturned">Overturned</option>
            </Select>
          </Field>
        </div>
        <div className="mb-4 flex-1">
          <SearchBar
            value={q}
            label="Search appeals"
            placeholder="User ID, appeal ID or text"
            onSearch={(v) => {
              setQ(v);
              setOffset(0);
            }}
          />
        </div>
      </div>

      <Card padding="sm">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={6} /></div>
        ) : appeals.length === 0 ? (
          <EmptyState title="No appeals here" description="Appeals will appear here when users submit them." />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableHeaderCell>User</DataTableHeaderCell>
              <DataTableHeaderCell>Action</DataTableHeaderCell>
              <DataTableHeaderCell>Reason</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell>Created</DataTableHeaderCell>
              <DataTableHeaderCell>Decision</DataTableHeaderCell>
            </DataTableHead>
            <DataTableBody>
              {appeals.map((a) => (
                <DataTableRow key={a.id}>
                  <DataTableCell className="font-mono text-xs">{a.user_id}</DataTableCell>
                  <DataTableCell>{a.action}</DataTableCell>
                  <DataTableCell>{a.reason_code}</DataTableCell>
                  <DataTableCell><Badge variant={statusBadge(a.status)}>{a.status}</Badge></DataTableCell>
                  <DataTableCell className="text-stone-500">{new Date(a.created_at).toLocaleString()}</DataTableCell>
                  <DataTableCell>
                    {canDecide && a.status === 'pending' ? (
                      <div className="flex gap-2">
                        <Button variant="ghost" disabled={busyId === a.id} onClick={() => setPrompt({ id: a.id, status: 'upheld' })}>Uphold</Button>
                        <Button variant="primary" disabled={busyId === a.id} onClick={() => setPrompt({ id: a.id, status: 'overturned' })}>Overturn</Button>
                      </div>
                    ) : (
                      <span className="text-xs text-stone-400">{a.status === 'pending' ? 'View only' : 'Decided'}</span>
                    )}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </Card>
      {!loading && (
        <Pager offset={page.offset} limit={page.limit} total={page.total} count={appeals.length} onChange={setOffset} />
      )}

      <PromptDialog
        open={!!prompt}
        title={prompt ? `Reason for ${prompt.status}` : ''}
        placeholder="Enter reason (min 3 characters)"
        confirmLabel="Submit decision"
        loading={!!busyId}
        onConfirm={(v) => void decide(v)}
        onCancel={() => setPrompt(null)}
      />
    </div>
  );
}
