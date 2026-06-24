import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react';
import { adminRequest } from '../services/api/adminClient';
import { MODERATION_REASON_CODES } from '../constants/reasonCodes';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Select, Textarea, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge, priorityBadge, statusBadge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/Dialog';
import { PageLoader } from '../components/ui/Skeleton';

type CaseDetail = {
  report: Record<string, unknown>;
  actions: Record<string, unknown>[];
  subject_history: Record<string, unknown>[];
};

function JsonPanel({ title, data, defaultOpen = false }: { title: string; data: unknown; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card padding="md">
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)}>
        <h3 className="font-semibold text-slate-800">{title}</h3>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && (
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{JSON.stringify(data, null, 2)}</pre>
      )}
    </Card>
  );
}

export function ModerationCasePage() {
  const { reportId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<CaseDetail | null>(null);
  const [error, setError] = useState('');
  const [reasonCode, setReasonCode] = useState('harassment');
  const [reasonText, setReasonText] = useState('');
  const [contentAction, setContentAction] = useState<'none' | 'remove'>('none');
  const [userAction, setUserAction] = useState<'none' | 'warn' | 'suspend' | 'ban'>('warn');
  const [suspendDays, setSuspendDays] = useState(7);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    adminRequest<CaseDetail>(`/admin/moderation/reports/${reportId}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load case'));
  }, [reportId]);

  async function assignInvestigating() {
    if (!reportId) return;
    await adminRequest(`/admin/moderation/reports/${reportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ workflow_status: 'investigating' }),
    });
    const refreshed = await adminRequest<CaseDetail>(`/admin/moderation/reports/${reportId}`);
    setData(refreshed);
  }

  async function applyDecision() {
    if (!reportId || reasonText.trim().length < 3) {
      setError('Reason text must be at least 3 characters');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await adminRequest(`/admin/moderation/reports/${reportId}/decision`, {
        method: 'POST',
        body: JSON.stringify({
          decision: {
            action: 'manual_review',
            severity: 'medium',
            reasonCode,
            reasonText,
            enforcement: {
              contentAction,
              userAction,
              strikeDelta: userAction === 'none' ? 0 : 1,
              suspendDays: userAction === 'suspend' ? suspendDays : undefined,
            },
            closeReport: true,
            notifyUser: true,
          },
        }),
      });
      navigate('/moderation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Decision failed');
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (reasonText.trim().length < 3) {
      setError('Reason text must be at least 3 characters');
      return;
    }
    setConfirmOpen(true);
  }

  if (!data) return error ? <AlertBanner message={error} /> : <PageLoader />;
  const report = data.report;

  return (
    <div>
      <Link to="/moderation" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> Back to queue
      </Link>
      <PageHeader title={`Case ${String(report.id).slice(0, 16)}…`} subtitle="Review evidence and apply enforcement" />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padding="lg">
          <h3 className="mb-4 font-semibold text-slate-800">Report details</h3>
          <dl className="space-y-3 text-sm">
            <div><dt className="text-slate-500">Target</dt><dd className="font-mono text-slate-800">{String(report.target_type)} / {String(report.target_id)}</dd></div>
            <div><dt className="text-slate-500">Reason</dt><dd>{String(report.reason)}</dd></div>
            <div className="flex gap-2">
              <Badge variant={statusBadge(String(report.workflow_status))}>{String(report.workflow_status)}</Badge>
              <Badge variant={priorityBadge(String(report.priority))}>{String(report.priority)}</Badge>
            </div>
          </dl>
          <JsonPanel title="Evidence" data={report.details} defaultOpen />
          <Button variant="outline" className="mt-4" onClick={() => void assignInvestigating()}>Mark investigating</Button>
        </Card>

        <Card padding="lg" className="lg:sticky lg:top-8 lg:self-start">
          <h3 className="mb-4 font-semibold text-slate-800">Decision panel</h3>
          <form onSubmit={onSubmit}>
            <Field label="Reason code">
              <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} required>
                {MODERATION_REASON_CODES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Reason text">
              <Textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={3} required />
            </Field>
            <Field label="Content action">
              <Select value={contentAction} onChange={(e) => setContentAction(e.target.value as 'none' | 'remove')}>
                <option value="none">No content change</option>
                <option value="remove">Remove content</option>
              </Select>
            </Field>
            <Field label="User action">
              <Select value={userAction} onChange={(e) => setUserAction(e.target.value as typeof userAction)}>
                <option value="none">None</option>
                <option value="warn">Warn</option>
                <option value="suspend">Suspend</option>
                <option value="ban">Ban</option>
              </Select>
            </Field>
            {userAction === 'suspend' && (
              <Field label="Suspend days">
                <Input type="number" min={1} max={365} value={suspendDays} onChange={(e) => setSuspendDays(Number(e.target.value))} />
              </Field>
            )}
            <Button type="submit" loading={submitting} className="w-full">Apply decision</Button>
          </form>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <JsonPanel title={`Subject history (${data.subject_history.length})`} data={data.subject_history} />
        <JsonPanel title={`Prior actions (${data.actions.length})`} data={data.actions} />
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Apply moderation decision?"
        message="This will enforce the selected actions and close the report."
        confirmLabel="Apply"
        variant="danger"
        loading={submitting}
        onConfirm={() => void applyDecision()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
