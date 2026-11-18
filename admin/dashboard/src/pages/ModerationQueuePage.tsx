import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminRequest, listQuery, type Paged } from '../services/api/adminClient';
import { SearchBar, Pager } from '../components/admin/ListControls';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Select } from '../components/ui/Input';
import { Switch } from '../components/ui/Input';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge, priorityBadge, statusBadge } from '../components/ui/Badge';
import { DataTable, DataTableHead, DataTableHeaderCell, DataTableBody, DataTableRow, DataTableCell } from '../components/ui/DataTable';
import { EmptyState } from '../components/ui/DataTable';
import { TableSkeleton } from '../components/ui/Skeleton';
import { reportKindLabel } from '../lib/reportKind';

type Report = {
  id: string;
  target_type: string;
  target_id: string;
  reason: string;
  workflow_status: string;
  priority: string;
  created_at: string;
  details?: unknown;
};

const PAGE_SIZE = 50;

export function ModerationQueuePage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [status, setStatus] = useState('pending');
  const [priority, setPriority] = useState('');
  const [slaBreached, setSlaBreached] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Paged>({ total: 0, limit: PAGE_SIZE, offset: 0, has_more: false });

  useEffect(() => {
    setLoading(true);
    const query = listQuery({
      status,
      priority,
      sla_breached: slaBreached ? 'true' : undefined,
      q,
      limit: PAGE_SIZE,
      offset,
    });
    adminRequest<{ reports: Report[] } & Paged>(`/admin/moderation/reports${query}`)
      .then((res) => {
        setReports(res.reports || []);
        setPage(res);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [status, priority, slaBreached, q, offset]);

  return (
    <div>
      <PageHeader title="Moderation Queue" subtitle="Triage reported content and user violations" />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      <Card className="mb-6" padding="md">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Status">
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} className="min-w-[160px]">
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="investigating">Investigating</option>
              <option value="actioned">Actioned</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => { setPriority(e.target.value); setOffset(0); }} className="min-w-[140px]">
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </Select>
          </Field>
          <Switch checked={slaBreached} onChange={(v) => { setSlaBreached(v); setOffset(0); }} label="SLA breached only" />
        </div>
        <div className="mt-4">
          <SearchBar
            value={q}
            label="Search reports"
            placeholder="Report ID, target ID or reason"
            onSearch={(v) => {
              setQ(v);
              setOffset(0);
            }}
          />
        </div>
      </Card>

      <Card padding="sm">
        {loading ? (
          <div className="p-4"><TableSkeleton rows={6} cols={6} /></div>
        ) : reports.length === 0 ? (
          <EmptyState title="No reports in queue" description="Adjust filters or check back later." />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableHeaderCell>ID</DataTableHeaderCell>
              <DataTableHeaderCell>Target</DataTableHeaderCell>
              <DataTableHeaderCell>Reason</DataTableHeaderCell>
              <DataTableHeaderCell>Status</DataTableHeaderCell>
              <DataTableHeaderCell>Priority</DataTableHeaderCell>
              <DataTableHeaderCell>Created</DataTableHeaderCell>
            </DataTableHead>
            <DataTableBody>
              {reports.map((r) => (
                <DataTableRow key={r.id}>
                  <DataTableCell>
                    <Link to={`/moderation/${r.id}`} className="font-medium text-brand-600 hover:text-brand-700">
                      {r.id.slice(0, 12)}…
                    </Link>
                  </DataTableCell>
                  <DataTableCell className="font-mono text-xs text-stone-600">
                    {r.target_type}:{r.target_id.slice(0, 8)}…
                    {reportKindLabel(r.details) ? (
                      <span className="ml-2 font-sans">
                        <Badge variant="info">{reportKindLabel(r.details)}</Badge>
                      </span>
                    ) : null}
                  </DataTableCell>
                  <DataTableCell>{r.reason}</DataTableCell>
                  <DataTableCell><Badge variant={statusBadge(r.workflow_status)}>{r.workflow_status}</Badge></DataTableCell>
                  <DataTableCell><Badge variant={priorityBadge(r.priority)}>{r.priority}</Badge></DataTableCell>
                  <DataTableCell className="text-stone-500">{new Date(r.created_at).toLocaleString()}</DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </Card>
      {!loading && <Pager offset={page.offset} limit={page.limit} total={page.total} count={reports.length} onChange={setOffset} />}
    </div>
  );
}
