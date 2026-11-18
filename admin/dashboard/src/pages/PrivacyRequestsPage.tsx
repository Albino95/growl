import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ChevronUp, Download, Plus } from 'lucide-react';
import {
  adminRequest,
  createPrivacyRequest,
  downloadJson,
  exportUserData,
  listQuery,
  type Paged,
} from '../services/api/adminClient';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { useAdminToast, errorMessage } from '../components/admin/Toast';
import { SearchBar, Pager } from '../components/admin/ListControls';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Select, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge, statusBadge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/Dialog';
import { TableSkeleton } from '../components/ui/Skeleton';
import { DataTable, DataTableHead, DataTableHeaderCell, DataTableBody, DataTableRow, DataTableCell, EmptyState } from '../components/ui/DataTable';

type PrivacyRequest = {
  id: string;
  user_id: string;
  email?: string;
  request_type: 'export' | 'delete' | string;
  status: string;
  created_at: string;
  finished?: boolean;
};

type Next = 'in_progress' | 'completed' | 'rejected';

const PAGE_SIZE = 50;

function confirmCopy(r: PrivacyRequest, next: Next): { title: string; message: string; label: string } {
  if (next === 'rejected') {
    return {
      title: 'Reject this request?',
      message:
        r.request_type === 'delete'
          ? 'The account will not be deleted. Make sure you have told the member why.'
          : 'No export will be sent. Make sure you have told the member why.',
      label: 'Reject request',
    };
  }
  return r.request_type === 'delete'
    ? {
        title: 'Complete this deletion?',
        message:
          'The account is anonymised and signed out now, and permanently deleted (posts, messages, media) after 7 days. This cannot be undone.',
        label: 'Delete account',
      }
    : {
        title: 'Mark export as completed?',
        message: 'Only do this once the export file has been sent to the member.',
        label: 'Mark completed',
      };
}

export function PrivacyRequestsPage() {
  const { can } = useAdminAuth();
  const toast = useAdminToast();
  const canWrite = can('privacy.write');
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [page, setPage] = useState<Paged>({ total: 0, limit: PAGE_SIZE, offset: 0, has_more: false });
  const [status, setStatus] = useState('pending');
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [confirm, setConfirm] = useState<{ request: PrivacyRequest; next: Next } | null>(null);
  const [newUserId, setNewUserId] = useState('');
  const [newType, setNewType] = useState<'export' | 'delete'>('export');
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminRequest<{ requests: PrivacyRequest[] } & Paged>(
        `/admin/privacy/requests${listQuery({ status, q, limit: PAGE_SIZE, offset })}`
      );
      setRequests(res.requests || []);
      setPage(res);
      setError('');
    } catch (e) {
      setError(errorMessage(e, 'Failed to load requests'));
    } finally {
      setLoading(false);
    }
  }, [status, q, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateStatus(r: PrivacyRequest, next: Next) {
    setBusyId(r.id);
    try {
      await adminRequest(`/admin/privacy/requests/${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      toast.success(next === 'in_progress' ? 'Request started' : `Request ${next}`);
      await load();
    } catch (e) {
      toast.error(errorMessage(e, 'Update failed'));
    } finally {
      setBusyId('');
      setConfirm(null);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!newUserId.trim()) return;
    setCreating(true);
    try {
      await createPrivacyRequest(newUserId.trim(), newType);
      setNewUserId('');
      setFormOpen(false);
      toast.success('Request created');
      await load();
    } catch (e) {
      toast.error(errorMessage(e, 'Create failed'));
    } finally {
      setCreating(false);
    }
  }

  async function handleExport(userId: string) {
    setBusyId(`export:${userId}`);
    try {
      const payload = await exportUserData(userId);
      downloadJson(`privacy-export-${userId}.json`, payload);
      toast.success('Export downloaded (recorded in the audit log)');
    } catch (e) {
      toast.error(errorMessage(e, 'Export failed'));
    } finally {
      setBusyId('');
    }
  }

  const copy = confirm ? confirmCopy(confirm.request, confirm.next) : null;

  return (
    <div>
      <PageHeader
        title="Privacy Requests"
        subtitle="Handle data export and deletion requests"
        action={
          canWrite ? (
            <Button variant="outline" onClick={() => setFormOpen(!formOpen)} aria-expanded={formOpen}>
              <Plus className="h-4 w-4" aria-hidden /> New request
            </Button>
          ) : undefined
        }
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      {formOpen && canWrite && (
        <Card className="mb-6" padding="md">
          <button
            type="button"
            className="mb-4 flex w-full items-center justify-between focus-ring rounded"
            aria-label="Close new request form"
            onClick={() => setFormOpen(false)}
          >
            <span className="font-semibold text-stone-800">Create on behalf of user</span>
            <ChevronUp className="h-4 w-4 text-stone-400" aria-hidden />
          </button>
          <form onSubmit={onCreate} className="flex flex-wrap items-end gap-4">
            <Field label="User ID"><Input value={newUserId} onChange={(e) => setNewUserId(e.target.value)} required className="min-w-[200px]" /></Field>
            <Field label="Type">
              <Select value={newType} onChange={(e) => setNewType(e.target.value as 'export' | 'delete')}>
                <option value="export">Export</option>
                <option value="delete">Delete</option>
              </Select>
            </Field>
            <Button type="submit" loading={creating}>Create</Button>
          </form>
        </Card>
      )}

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
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
            </Select>
          </Field>
        </div>
        <div className="mb-4 flex-1">
          <SearchBar
            value={q}
            label="Search privacy requests"
            placeholder="Email, user ID or request ID"
            onSearch={(v) => {
              setQ(v);
              setOffset(0);
            }}
          />
        </div>
      </div>

      <Card padding="sm">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={5} /></div>
        ) : requests.length === 0 ? (
          <EmptyState title="No privacy requests" description={q ? 'Nothing matches that search.' : undefined} />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableHeaderCell>User</DataTableHeaderCell>
              <DataTableHeaderCell>Type</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell>Created</DataTableHeaderCell>
              <DataTableHeaderCell>Actions</DataTableHeaderCell>
            </DataTableHead>
            <DataTableBody>
              {requests.map((r) => {
                const finished = r.finished ?? (r.status === 'completed' || r.status === 'rejected');
                const busy = busyId === r.id;
                return (
                  <DataTableRow key={r.id}>
                    <DataTableCell>{r.email || r.user_id}</DataTableCell>
                    <DataTableCell><Badge variant={r.request_type === 'delete' ? 'danger' : 'info'}>{r.request_type}</Badge></DataTableCell>
                    <DataTableCell><Badge variant={statusBadge(r.status)}>{r.status.replace('_', ' ')}</Badge></DataTableCell>
                    <DataTableCell className="text-stone-500">{new Date(r.created_at).toLocaleString()}</DataTableCell>
                    <DataTableCell>
                      <div className="flex flex-wrap gap-2">
                        {canWrite && !finished && (
                          <>
                            {r.status === 'pending' && (
                              <Button variant="ghost" loading={busy && !confirm} disabled={busy} onClick={() => void updateStatus(r, 'in_progress')}>
                                Start
                              </Button>
                            )}
                            <Button variant="primary" disabled={busy} onClick={() => setConfirm({ request: r, next: 'completed' })}>
                              Complete
                            </Button>
                            <Button variant="danger" disabled={busy} onClick={() => setConfirm({ request: r, next: 'rejected' })}>
                              Reject
                            </Button>
                          </>
                        )}
                        {r.request_type === 'export' && (
                          <Button
                            variant="outline"
                            aria-label={`Download export for ${r.email || r.user_id}`}
                            loading={busyId === `export:${r.user_id}`}
                            onClick={() => void handleExport(r.user_id)}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        )}
                        {finished && r.request_type !== 'export' && <span className="text-xs text-stone-400">Done</span>}
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTable>
        )}
      </Card>
      {!loading && (
        <Pager offset={page.offset} limit={page.limit} total={page.total} count={requests.length} onChange={setOffset} />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={copy?.title || ''}
        message={copy?.message || ''}
        confirmLabel={copy?.label}
        variant={confirm?.next === 'completed' && confirm.request.request_type !== 'delete' ? 'primary' : 'danger'}
        loading={!!busyId}
        onConfirm={() => confirm && void updateStatus(confirm.request, confirm.next)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
