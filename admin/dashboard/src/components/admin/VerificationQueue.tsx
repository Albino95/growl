import { useCallback, useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { adminRequest, AdminApiError } from '../../services/api/adminClient';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge, statusBadge } from '../ui/Badge';
import { ConfirmDialog, PromptDialog } from '../ui/Dialog';
import { TableSkeleton } from '../ui/Skeleton';
import { useAdminToast, errorMessage } from './Toast';

type Verification = {
  business_id: string;
  business_name: string;
  email: string;
  status: string;
  website?: string | null;
  registration_number?: string | null;
  note?: string | null;
  reason?: string | null;
  submitted_at: string;
};

/** Pending business verification requests (API: GET/POST /admin/business/verifications). */
export function VerificationQueue({ onDecided }: { onDecided?: () => void }) {
  const toast = useAdminToast();
  const [items, setItems] = useState<Verification[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [approve, setApprove] = useState<Verification | null>(null);
  const [reject, setReject] = useState<Verification | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminRequest<{ verifications: Verification[] }>('/admin/business/verifications?status=pending');
      setItems(res.verifications || []);
    } catch (err) {
      // Older API without the verification queue: hide the card.
      if (err instanceof AdminApiError && err.status === 404) setUnavailable(true);
      else toast.error(errorMessage(err, 'Could not load verification requests'));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(v: Verification, ok: boolean, reason?: string) {
    if (!ok && (!reason || reason.trim().length < 3)) {
      toast.error('Add a short reason so the business knows what to fix');
      return;
    }
    setBusy(true);
    try {
      await adminRequest(`/admin/business/verifications/${v.business_id}`, {
        method: 'POST',
        body: JSON.stringify({ approve: ok, reason: ok ? undefined : reason?.trim() }),
      });
      toast.success(ok ? `${v.business_name} is verified` : `Sent back to ${v.business_name}`);
      setApprove(null);
      setReject(null);
      await load();
      onDecided?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save the decision'));
    } finally {
      setBusy(false);
    }
  }

  if (unavailable) return null;

  return (
    <Card padding="md" className="mb-6">
      <h3 className="mb-3 font-semibold text-stone-800">
        Verification requests{!loading && items.length > 0 ? ` (${items.length})` : ''}
      </h3>
      {loading ? (
        <TableSkeleton rows={2} cols={3} />
      ) : items.length === 0 ? (
        <p className="text-sm text-stone-500">No businesses are waiting for verification.</p>
      ) : (
        <ul className="divide-y divide-surface-border">
          {items.map((v) => (
            <li key={v.business_id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-stone-900">
                  {v.business_name} <Badge variant={statusBadge(v.status)}>{v.status}</Badge>
                </p>
                <p className="text-xs text-stone-500">{v.email}</p>
                {v.website && (
                  <a
                    href={v.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                  >
                    {v.website} <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                )}
                {v.registration_number && <p className="text-xs text-stone-600">Reg. no. {v.registration_number}</p>}
                {v.note && <p className="mt-1 text-xs text-stone-600">“{v.note}”</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="primary" disabled={busy} onClick={() => setApprove(v)}>Verify</Button>
                <Button variant="ghost" disabled={busy} onClick={() => setReject(v)}>Send back</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!approve}
        title="Verify this business?"
        message={`${approve?.business_name || ''} will show a verified badge on its storefront and products.`}
        confirmLabel="Verify"
        loading={busy}
        onConfirm={() => approve && void decide(approve, true)}
        onCancel={() => setApprove(null)}
      />
      <PromptDialog
        open={!!reject}
        title="What should they fix?"
        message="The business sees this reason."
        placeholder="e.g. The registration number doesn't match the website"
        confirmLabel="Send back"
        loading={busy}
        onConfirm={(reason) => reject && void decide(reject, false, reason)}
        onCancel={() => setReject(null)}
      />
    </Card>
  );
}
