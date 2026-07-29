import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Check, Copy } from 'lucide-react';
import {
  createBusinessAccount,
  listBusinessAccounts,
  updateBusinessAccount,
  type BusinessAccount,
  type CreateBusinessAccountResponse,
} from '../services/api/adminClient';
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
import { PageLoader } from '../components/ui/Skeleton';

const FIELD_LABELS: Record<string, string> = {
  fitness: 'Fitness',
  nutrition: 'Nutrition',
  apparel: 'Apparel',
  wellness: 'Wellness',
  education: 'Education',
  other: 'Other',
};

export function BusinessAccountsPage() {
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

  async function load() {
    setLoading(true);
    try {
      const res = await listBusinessAccounts();
      setAccounts(res.accounts || []);
      setFields(res.fields || Object.keys(FIELD_LABELS));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load business accounts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
    setError('');
    try {
      await updateBusinessAccount(userId, { verificationStatus });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    }
  }

  async function deactivate(userId: string) {
    if (!window.confirm('Deactivate this business account? The user will lose business app access.')) return;
    setError('');
    try {
      await updateBusinessAccount(userId, { deactivate: true });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Deactivate failed');
    }
  }

  function copyCredentials() {
    if (!created) return;
    const text = `Grow! Business Account\nEmail: ${created.email}\nTemporary password: ${created.temporaryPassword}\nSign in: Seller tab on the admin portal, or the Grow! mobile app.`;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading && accounts.length === 0) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Business Accounts"
        subtitle="Provision sellers for Grow!. They sign in via the Seller tab on this portal or the mobile app."
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      {created && (
        <Card className="mb-6 border-emerald-200 bg-emerald-50" padding="lg">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 text-emerald-600" />
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
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy credentials'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card padding="lg">
          <h3 className="mb-4 font-semibold text-slate-800">Register business</h3>
          <form onSubmit={onRegister} className="space-y-4">
            <Field label="Login email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Temporary password">
              <Input type="text" value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} required minLength={12} />
              <p className="mt-1 text-xs text-slate-500">Min 12 chars, upper, lower, number, symbol. Shown once after creation.</p>
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

        <Card padding="sm">
          <h3 className="mb-4 px-2 pt-2 font-semibold text-slate-800">All business accounts</h3>
          {accounts.length === 0 ? (
            <EmptyState title="No business accounts yet" description="Register the first business using the form." />
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
                        <p className="font-medium text-slate-800">{a.display_name}</p>
                        <p className="text-xs text-slate-500">{a.email}</p>
                        <p className="text-xs text-slate-400">{FIELD_LABELS[a.field_of_operation] || a.field_of_operation}</p>
                      </div>
                    </DataTableCell>
                    <DataTableCell>
                      <Badge variant={statusBadge(a.verification_status)}>{a.verification_status}</Badge>
                    </DataTableCell>
                    <DataTableCell className="text-slate-500 text-xs">
                      {new Date(a.profile_created_at || a.created_at).toLocaleDateString()}
                    </DataTableCell>
                    <DataTableCell>
                      <div className="flex flex-wrap gap-1">
                        <Link to={`/business/accounts/${a.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">Overview</Link>
                        <Link to={`/users/${a.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700">User</Link>
                        {a.verification_status !== 'verified' && (
                          <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => void setVerification(a.id, 'verified')}>Verify</Button>
                        )}
                        {a.verification_status !== 'rejected' && (
                          <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => void setVerification(a.id, 'rejected')}>Reject</Button>
                        )}
                        {!!a.is_business && (
                          <Button variant="ghost" className="h-7 px-2 text-xs text-red-600" onClick={() => void deactivate(a.id)}>Deactivate</Button>
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
    </div>
  );
}
