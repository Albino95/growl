import { FormEvent, useEffect, useState } from 'react';
import { ChevronUp, Download, Plus } from 'lucide-react';
import { adminRequest, createPrivacyRequest, exportUserData } from '../services/api/adminClient';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Select, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge, statusBadge } from '../components/ui/Badge';
import { DataTable, DataTableHead, DataTableHeaderCell, DataTableBody, DataTableRow, DataTableCell, EmptyState } from '../components/ui/DataTable';

type PrivacyRequest = {
  id: string;
  user_id: string;
  email?: string;
  request_type: string;
  status: string;
  created_at: string;
};

export function PrivacyRequestsPage() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [newType, setNewType] = useState<'export' | 'delete'>('export');
  const [creating, setCreating] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  async function load() {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    const res = await adminRequest<{ requests: PrivacyRequest[] }>(`/admin/privacy/requests?${params}`);
    setRequests(res.requests || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [status]);

  async function updateStatus(id: string, next: 'in_progress' | 'completed' | 'rejected') {
    setBusyId(id);
    try {
      await adminRequest(`/admin/privacy/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId('');
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
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function handleExport(userId: string) {
    try {
      const payload = await exportUserData(userId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `privacy-export-${userId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  return (
    <div>
      <PageHeader
        title="Privacy Requests"
        subtitle="Handle data export and deletion requests"
        action={
          <Button variant="outline" onClick={() => setFormOpen(!formOpen)}>
            <Plus className="h-4 w-4" /> New request
          </Button>
        }
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      {formOpen && (
        <Card className="mb-6" padding="md">
          <button type="button" className="mb-4 flex w-full items-center justify-between" onClick={() => setFormOpen(false)}>
            <span className="font-semibold text-slate-800">Create on behalf of user</span>
            <ChevronUp className="h-4 w-4 text-slate-400" />
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

      <div className="mb-4 max-w-xs">
        <Field label="Status filter">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </Select>
        </Field>
      </div>

      <Card padding="sm">
        {requests.length === 0 ? (
          <EmptyState title="No privacy requests" />
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
              {requests.map((r) => (
                <DataTableRow key={r.id}>
                  <DataTableCell>{r.email || r.user_id}</DataTableCell>
                  <DataTableCell><Badge variant="info">{r.request_type}</Badge></DataTableCell>
                  <DataTableCell><Badge variant={statusBadge(r.status)}>{r.status}</Badge></DataTableCell>
                  <DataTableCell className="text-slate-500">{new Date(r.created_at).toLocaleString()}</DataTableCell>
                  <DataTableCell>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" disabled={busyId === r.id} onClick={() => void updateStatus(r.id, 'in_progress')}>Start</Button>
                      <Button variant="primary" disabled={busyId === r.id} onClick={() => void updateStatus(r.id, 'completed')}>Complete</Button>
                      <Button variant="danger" disabled={busyId === r.id} onClick={() => void updateStatus(r.id, 'rejected')}>Reject</Button>
                      {r.request_type === 'export' && (
                        <Button variant="outline" onClick={() => void handleExport(r.user_id)}><Download className="h-3.5 w-3.5" /></Button>
                      )}
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </Card>
    </div>
  );
}
