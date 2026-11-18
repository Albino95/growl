import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Check, Copy } from 'lucide-react';
import {
  createBusinessAccount,
  listBusinessAccounts,
  updateBusinessAccount,
  type BusinessAccount,
  type CreateBusinessAccountResponse,
  type Paged,
} from '../services/api/adminClient';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { useAdminToast, errorMessage } from '../components/admin/Toast';
import { SearchBar, Pager } from '../components/admin/ListControls';
import { VerificationQueue } from '../components/admin/VerificationQueue';
import { ConfirmDialog } from '../components/ui/Dialog';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Select, Textarea, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AlertBanner } from '../components/ui/AlertBanner';
import { Badge, statusBadge } from '../components/ui/Badge';
import {
  DataTable,
  DataTableHead,
  DataTableHeaderCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
  EmptyState,
} from '../components/ui/DataTable';
import { TableSkeleton } from '../components/ui/Skeleton';

const FIELD_LABELS: Record<string, string> = {
  fitness: 'Fitness',
  nutrition: 'Nutrition',
  apparel: 'Apparel',
  wellness: 'Wellness',
  education: 'Education',
  other: 'Other',
};

const PAGE_SIZE = 25;

export function BusinessAccountsPage() {
  const { can } = useAdminAuth();
  const toast = useAdminToast();
  const canWrite = can('business.write');
  const canViewUsers = can('users.read');
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState<Paged>({ total: 0, limit: PAGE_SIZE, offset: 0, has_more: false });
  const [pendingAction, setPendingAction] = useState<{ account: BusinessAccount; kind: 'deactivate' | 'reactivate' } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [accounts, setAccounts] = useState<BusinessAccount[]>([]);
  const [fields, setFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreateBusinessAccountResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [fieldOfOperation, setFieldOfOperation] = useState('fitness');
  const [vatNumber, setVatNumber] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBusinessAccounts({ q, status: statusFilter, limit: PAGE_SIZE, offset });
      setAccounts(res.accounts || []);
      setFields(res.fields || Object.keys(FIELD_LABELS));
      setPage(res);
    } catch (e) {
      setError(errorMessage(e, 'Failed to load business accounts'));
    } finally {
      setLoading(false);
    }
  }, [q, statusFilter, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setCreated(null);
    try {
      const res = await createBusinessAccount({
        email: email.trim().toLowerCase(),
        temporaryPassword,
        displayName: displayName.trim(),
        contactEmail: contactEmail.trim().toLowerCase(),
        contactPhone: contactPhone.trim() || undefined,
        fieldOfOperation,
        vatNumber: vatNumber.trim() || undefined,
        countryCode: countryCode.trim() || undefined,
        addressLine: addressLine.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setCreated(res);
      setEmail('');
      setTemporaryPassword('');
      setDisplayName('');
      setContactEmail('');
      setContactPhone('');
      setVatNumber('');
      setCountryCode('');
      setAddressLine('');
      setNotes('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function setVerification(userId: string, verificationStatus: 'verified' | 'rejected') {
    try {
      await updateBusinessAccount(userId, { verificationStatus });
      toast.success(verificationStatus === 'verified' ? 'Business verified' : 'Verification rejected');
      await load();
    } catch (e) {
      toast.error(errorMessage(e, 'Update failed'));
    }
  }

  async function applyActivation() {
    if (!pendingAction) return;
    const { account, kind } = pendingAction;
    setActionBusy(true);
    try {
      await updateBusinessAccount(account.id, { deactivate: kind === 'deactivate' });
      toast.success(kind === 'deactivate' ? `${account.display_name} deactivated` : `${account.display_name} reactivated`);
      setPendingAction(null);
      await load();
    } catch (e) {
      toast.error(errorMessage(e, kind === 'deactivate' ? 'Deactivate failed' : 'Reactivate failed'));
    } finally {
      setActionBusy(false);
    }
  }

  function copyCredentials() {
    if (!created) return;
    const text = `Grow! Business Account\nEmail: ${created.email}\nTemporary password: ${created.temporaryPassword}\nSign in: Seller tab on the admin portal, or the Grow! mobile app.`;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <PageHeader
        title="Business Accounts"
        subtitle={
          canWrite
            ? 'Provision sellers for Grow!. They sign in via the Seller tab on this portal or the mobile app.'
            : 'Sellers on Grow!'
        }
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}
      {canWrite && <VerificationQueue onDecided={() => void load()} />}

      {created && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50" padding="lg">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden />
            <div className="flex-1">
              <h3 className="font-semibold text-emerald-900">Business account created</h3>
              <p className="mt-1 text-sm text-emerald-800">
                Share these credentials securely. Sellers use the Seller tab on this portal (or the Grow! mobile app).
              </p>
              <dl className="mt-3 space-y-1 text-sm">
                <div><dt className="inline font-medium text-emerald-900">Email: </dt><dd className="inline font-mono">{created.email}</dd></div>
                <div><dt className="inline font-medium text-emerald-900">Temporary password: </dt><dd className="inline font-mono">{created.temporaryPassword}</dd></div>
                <div><dt className="inline font-medium text-emerald-900">User ID: </dt><dd className="inline font-mono text-xs">{created.userId}</dd></div>
              </dl>
              <Button className="mt-4" variant="outline" onClick={copyCredentials}>
                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? 'Copied' : 'Copy credentials'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className={`grid gap-6 ${canWrite ? 'lg:grid-cols-2' : ''}`}>
        {canWrite && (
        <Card padding="lg">
          <h3 className="mb-4 font-semibold text-stone-800">Register business</h3>
          <form onSubmit={onRegister} className="space-y-4">
            <Field label="Login email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Temporary password">
              <Input type="text" value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} required minLength={12} />
              <p className="mt-1 text-xs text-stone-500">Min 12 chars, upper, lower, number, symbol. Shown once after creation.</p>
            </Field>
            <Field label="Display name">
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
            </Field>
            <Field label="Contact email">
              <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required />
            </Field>
            <Field label="Contact phone">
              <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            </Field>
            <Field label="Field of operation">
              <Select value={fieldOfOperation} onChange={(e) => setFieldOfOperation(e.target.value)} required>
                {(fields.length ? fields : Object.keys(FIELD_LABELS)).map((f) => (
                  <option key={f} value={f}>{FIELD_LABELS[f] || f}</option>
                ))}
              </Select>
            </Field>
            <Field label="VAT number (optional)">
              <Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
            </Field>
            <Field label="Country code (optional)">
              <Input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="US" />
            </Field>
            <Field label="Address (optional)">
              <Input value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
            </Field>
            <Field label="Internal notes">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </Field>
            <Button type="submit" loading={submitting} className="w-full">Create business account</Button>
          </form>
        </Card>
        )}

        <Card padding="sm">
          <h3 className="mb-3 px-2 pt-2 font-semibold text-stone-800">All business accounts</h3>
          <div className="mb-3 flex flex-col gap-2 px-2 sm:flex-row">
            <SearchBar
              value={q}
              label="Search business accounts"
              placeholder="Name, email or ID"
              onSearch={(v) => {
                setQ(v);
                setOffset(0);
              }}
            />
            <Select
              aria-label="Account status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setOffset(0);
              }}
              className="sm:w-40"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="deactivated">Deactivated</option>
            </Select>
          </div>
          {loading ? (
            <div className="p-2"><TableSkeleton rows={5} cols={4} /></div>
          ) : accounts.length === 0 ? (
            <EmptyState
              title={q || statusFilter ? 'No matching accounts' : 'No business accounts yet'}
              description={canWrite && !q ? 'Register the first business using the form.' : undefined}
            />
          ) : (
            <DataTable>
              <DataTableHead>
                <DataTableHeaderCell>Business</DataTableHeaderCell>
                <DataTableHeaderCell>Status</DataTableHeaderCell>
                <DataTableHeaderCell>Created</DataTableHeaderCell>
                <DataTableHeaderCell>Actions</DataTableHeaderCell>
              </DataTableHead>
              <DataTableBody>
                {accounts.map((a) => (
                  <DataTableRow key={a.id}>
                    <DataTableCell>
                      <div>
                        <p className="font-medium text-stone-800">{a.display_name}</p>
                        <p className="text-xs text-stone-500">{a.email}</p>
                        <p className="text-xs text-stone-400">{FIELD_LABELS[a.field_of_operation] || a.field_of_operation}</p>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={statusBadge(a.verification_status)}>{a.verification_status}</Badge>
                        {!a.is_business && <Badge variant="danger">deactivated</Badge>}
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-stone-500 text-xs">
                      {new Date(a.profile_created_at || a.created_at).toLocaleDateString()}
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex flex-wrap gap-1">
                        <Link to={`/business/accounts/${a.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">Overview</Link>
                        {canViewUsers && (
                          <Link to={`/users/${a.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">User</Link>
                        )}
                        {canWrite && a.verification_status !== 'verified' && (
                          <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => void setVerification(a.id, 'verified')}>Verify</Button>
                        )}
                        {canWrite && a.verification_status !== 'rejected' && (
                          <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => void setVerification(a.id, 'rejected')}>Reject</Button>
                        )}
                        {canWrite &&
                          (a.is_business ? (
                            <Button
                              variant="ghost"
                              className="h-7 px-2 text-xs text-red-600"
                              onClick={() => setPendingAction({ account: a, kind: 'deactivate' })}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setPendingAction({ account: a, kind: 'reactivate' })}
                            >
                              Reactivate
                            </Button>
                          ))}
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          )}
          {!loading && (
            <div className="px-2 pb-2">
              <Pager offset={page.offset} limit={page.limit} total={page.total} count={accounts.length} onChange={setOffset} />
            </div>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={!!pendingAction}
        title={pendingAction?.kind === 'reactivate' ? 'Reactivate this business?' : 'Deactivate this business?'}
        message={
          pendingAction?.kind === 'reactivate'
            ? `${pendingAction.account.display_name} gets seller access back.`
            : `${pendingAction?.account.display_name || 'This business'} loses business app access. You can reactivate it later.`
        }
        confirmLabel={pendingAction?.kind === 'reactivate' ? 'Reactivate' : 'Deactivate'}
        variant={pendingAction?.kind === 'reactivate' ? 'primary' : 'danger'}
        loading={actionBusy}
        onConfirm={() => void applyActivation()}
        onCancel={() => setPendingAction(null)}
      />
    </div>
  );
}
