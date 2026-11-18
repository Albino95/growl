import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { BadgeCheck, Clock, ShieldAlert } from 'lucide-react';
import {
  errorMessage,
  getVerification,
  isFeatureUnavailable,
  requestVerification,
  type VerificationStatus,
} from '../../services/api/sellerApi';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Textarea } from '../../components/ui/Input';
import { ComingSoonBlock, ErrorBlock, InlineNotice, LoadingBlock, useToast } from '../../components/seller/SellerUI';

export function SellerVerificationPage() {
  const toast = useToast();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [err, setErr] = useState('');
  const [website, setWebsite] = useState('');
  const [registration, setRegistration] = useState('');
  const [note, setNote] = useState('');
  const [formErr, setFormErr] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      setStatus(await getVerification());
      setState('ready');
    } catch (e) {
      if (isFeatureUnavailable(e)) setState('unavailable');
      else {
        setErr(errorMessage(e, 'Failed to load verification status'));
        setState('error');
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormErr('');
    const site = website.trim();
    if (site && !/^https:\/\/\S+\.\S+$/i.test(site)) {
      setFormErr('Use your full website address, starting with https://');
      return;
    }
    if (!site && !registration.trim()) {
      setFormErr('Add your website or your business registration number so we can check who you are.');
      return;
    }
    setSending(true);
    try {
      await requestVerification({
        ...(site ? { website: site } : {}),
        ...(registration.trim() ? { registration_number: registration.trim() } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setStatus({ status: 'pending' });
      toast('Request sent — we’ll review it soon');
    } catch (e2) {
      setFormErr(errorMessage(e2, 'Could not send your request'));
    } finally {
      setSending(false);
    }
  }

  const canRequest = status && (status.status === 'none' || status.status === 'rejected');

  return (
    <div>
      <PageHeader title="Verification" subtitle="A verified badge tells people your business is real and reviewed by Grow!." />
      <Card padding="lg" className="max-w-2xl">
        {state === 'loading' ? (
          <LoadingBlock rows={3} />
        ) : state === 'unavailable' ? (
          <ComingSoonBlock feature="Business verification" />
        ) : state === 'error' ? (
          <ErrorBlock message={err} onRetry={() => void load()} />
        ) : (
          <>
            {status?.status === 'verified' && (
              <div className="flex items-start gap-3">
                <BadgeCheck className="h-8 w-8 text-brand-600" aria-hidden />
                <div>
                  <p className="font-semibold text-stone-900">You’re verified</p>
                  <p className="text-sm text-stone-600">Your badge shows on your storefront and products in the app.</p>
                </div>
              </div>
            )}
            {status?.status === 'pending' && (
              <div className="flex items-start gap-3">
                <Clock className="h-8 w-8 text-amber-600" aria-hidden />
                <div>
                  <p className="font-semibold text-stone-900">We’re reviewing your request</p>
                  <p className="text-sm text-stone-600">This usually takes a few working days. We’ll notify you in the app.</p>
                </div>
              </div>
            )}
            {status?.status === 'rejected' && (
              <div className="mb-5">
                <InlineNotice tone="warn">
                  <span className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <span>
                      We couldn’t verify your business last time{status.reason ? `: ${status.reason}` : '.'} You can send a new request with more
                      details.
                    </span>
                  </span>
                </InlineNotice>
              </div>
            )}
            {canRequest && (
              <form onSubmit={onSubmit} noValidate>
                <p className="mb-4 text-sm text-stone-600">
                  Share something we can check — your website or your company registration number (RCS in Luxembourg). We only use it to verify you.
                </p>
                <Field label="Website">
                  <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://yourshop.lu" maxLength={300} />
                </Field>
                <Field label="Registration number">
                  <Input value={registration} onChange={(e) => setRegistration(e.target.value)} placeholder="B123456" maxLength={80} />
                </Field>
                <Field label="Anything else? (optional)">
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={600} />
                </Field>
                {formErr && (
                  <div className="mb-4">
                    <InlineNotice tone="warn">{formErr}</InlineNotice>
                  </div>
                )}
                <Button type="submit" loading={sending}>
                  Request verification
                </Button>
              </form>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
