import { useEffect, useState } from 'react';
import { adminRequest } from '../services/api/adminClient';
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

export function AppealsPage() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [prompt, setPrompt] = useState<{ id: string; status: 'upheld' | 'overturned' } | null>(null);

  async function load() {
    const res = await adminRequest<{ appeals: Appeal[] }>('/admin/moderation/appeals');
    setAppeals(res.appeals || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, []);

  async function decide(reasonText: string) {
    if (!prompt || reasonText.length < 3) return;
    setBusyId(prompt.id);
    setError('');
    try {
      await adminRequest(`/admin/moderation/appeals/${prompt.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ status: prompt.status, reasonText }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Decision failed');
    } finally {
      setBusyId('');
      setPrompt(null);
    }
  }

  return (
    <div>
      <PageHeader title="Appeals" subtitle="Review and decide moderation appeals" />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      <Card padding="sm">
        {appeals.length === 0 ? (
          <EmptyState title="No appeals pending" description="Appeals will appear here when users submit them." />
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
                  <DataTableCell className="text-slate-500">{new Date(a.created_at).toLocaleString()}</DataTableCell>
                  <DataTableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" disabled={busyId === a.id || a.status !== 'pending'} onClick={() => setPrompt({ id: a.id, status: 'upheld' })}>Uphold</Button>
                      <Button variant="primary" disabled={busyId === a.id || a.status !== 'pending'} onClick={() => setPrompt({ id: a.id, status: 'overturned' })}>Overturn</Button>
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </Card>

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
