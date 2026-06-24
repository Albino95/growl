import { FormEvent, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { adminRequest, exportUserData, updateUserRoles } from '../services/api/adminClient';
import { ENFORCEMENT_REASON_CODES } from '../constants/reasonCodes';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Select, Textarea, Input, Switch } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge, statusBadge } from '../components/ui/Badge';
import { ConfirmDialog } from '../components/ui/Dialog';
import { PageLoader } from '../components/ui/Skeleton';

type UserDetail = {
  user: Record<string, unknown>;
  reports: Record<string, unknown>[];
  audit_history: Record<string, unknown>[];
};

type Tab = 'account' | 'enforcement' | 'history';

export function UserDetailPage() {
  const { userId } = useParams();
  const [data, setData] = useState<UserDetail | null>(null);
  const [tab, setTab] = useState<Tab>('account');
  const [error, setError] = useState('');
  const [action, setAction] = useState<'warn' | 'suspend' | 'ban' | 'restore'>('warn');
  const [reasonCode, setReasonCode] = useState('harassment');
  const [reasonText, setReasonText] = useState('');
  const [suspendDays, setSuspendDays] = useState(7);
  const [isInstructor, setIsInstructor] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rolesBusy, setRolesBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function load() {
    if (!userId) return;
    const res = await adminRequest<UserDetail>(`/admin/users/${userId}`);
    setData(res);
    setIsInstructor(!!res.user.is_instructor);
  }

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Failed to load user'));
  }, [userId]);

  async function applyEnforcement() {
    if (!userId) return;
    setSubmitting(true);
    setError('');
    try {
      await adminRequest(`/admin/users/${userId}/enforcement`, {
        method: 'POST',
        body: JSON.stringify({ action, reasonCode, reasonText, suspendDays: action === 'suspend' ? suspendDays : undefined }),
      });
      await load();
      setTab('account');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enforcement failed');
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  }

  function onEnforce(e: FormEvent) {
    e.preventDefault();
    if (reasonText.trim().length < 3) {
      setError('Reason text must be at least 3 characters');
      return;
    }
    setConfirmOpen(true);
  }

  async function saveRoles() {
    if (!userId) return;
    setRolesBusy(true);
    try {
      await updateUserRoles(userId, { is_instructor: isInstructor });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update roles');
    } finally {
      setRolesBusy(false);
    }
  }

  async function handleExport() {
    if (!userId) return;
    try {
      const payload = await exportUserData(userId);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `user-export-${userId}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    }
  }

  if (!data) return error ? <AlertBanner message={error} /> : <PageLoader />;
  const user = data.user;
  const businessProfile = user.business_profile as Record<string, unknown> | null | undefined;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'account', label: 'Account' },
    { id: 'enforcement', label: 'Enforcement' },
    { id: 'history', label: 'History' },
  ];

  return (
    <div>
      <Link to="/users" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> Back to users
      </Link>
      <PageHeader title={String(user.email)} subtitle={String(user.id)} />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      <div className="mb-6 flex gap-1 rounded-xl bg-slate-100 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'account' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card padding="lg">
            <h3 className="mb-4 font-semibold">Account info</h3>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-slate-500">Status</dt><dd><Badge variant={statusBadge(String(user.account_status || 'active'))}>{String(user.account_status || 'active')}</Badge></dd></div>
              <div><dt className="text-slate-500">Strikes</dt><dd className="text-lg font-semibold">{String(user.strike_count ?? 0)}</dd></div>
              <div><dt className="text-slate-500">Suspended until</dt><dd>{user.suspended_until ? String(user.suspended_until) : '—'}</dd></div>
            </dl>
            <Button variant="outline" className="mt-4" onClick={() => void handleExport()}><Download className="h-4 w-4" /> Export data</Button>
          </Card>
          <Card padding="lg">
            <h3 className="mb-4 font-semibold">Roles</h3>
            <div className="space-y-4">
              <Switch checked={isInstructor} onChange={setIsInstructor} label="Instructor" />
            </div>
            {!!user.is_business && (
              <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
                <p className="font-medium text-slate-800">Business account</p>
                <p className="mt-1 text-slate-600">Managed via Business Accounts — not editable here.</p>
                {businessProfile && (
                  <dl className="mt-3 space-y-2">
                    <div><dt className="text-slate-500">Display name</dt><dd>{String(businessProfile.display_name)}</dd></div>
                    <div><dt className="text-slate-500">Verification</dt><dd><Badge variant={statusBadge(String(businessProfile.verification_status))}>{String(businessProfile.verification_status)}</Badge></dd></div>
                    <div><dt className="text-slate-500">Field</dt><dd>{String(businessProfile.field_of_operation)}</dd></div>
                  </dl>
                )}
                <Link to="/business/accounts" className="mt-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700">
                  Open Business Accounts
                </Link>
              </div>
            )}
            <Button className="mt-6" loading={rolesBusy} onClick={() => void saveRoles()}>Save roles</Button>
          </Card>
        </div>
      )}

      {tab === 'enforcement' && (
        <Card padding="lg" className="max-w-xl">
          <form onSubmit={onEnforce}>
            <Field label="Action">
              <Select value={action} onChange={(e) => setAction(e.target.value as typeof action)}>
                <option value="warn">Warn</option>
                <option value="suspend">Suspend</option>
                <option value="ban">Ban</option>
                <option value="restore">Restore</option>
              </Select>
            </Field>
            <Field label="Reason code">
              <Select value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} required>
                {ENFORCEMENT_REASON_CODES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Select>
            </Field>
            <Field label="Reason text">
              <Textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={3} required />
            </Field>
            {action === 'suspend' && (
              <Field label="Suspend days">
                <Input type="number" min={1} max={365} value={suspendDays} onChange={(e) => setSuspendDays(Number(e.target.value))} />
              </Field>
            )}
            <Button type="submit" variant={action === 'restore' ? 'primary' : 'danger'} loading={submitting}>
              Apply {action}
            </Button>
          </form>
        </Card>
      )}

      {tab === 'history' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card padding="md">
            <h3 className="mb-3 font-semibold">Related reports ({data.reports.length})</h3>
            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(data.reports, null, 2)}</pre>
          </Card>
          <Card padding="md">
            <h3 className="mb-3 font-semibold">Audit history ({data.audit_history.length})</h3>
            <pre className="max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{JSON.stringify(data.audit_history, null, 2)}</pre>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`Apply ${action}?`}
        message="This enforcement action will be recorded in the audit log."
        confirmLabel={`Apply ${action}`}
        variant={action === 'restore' ? 'primary' : 'danger'}
        loading={submitting}
        onConfirm={() => void applyEnforcement()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
