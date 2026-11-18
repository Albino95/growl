import { FormEvent, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import QRCode from 'qrcode';
import { Copy, Check, KeyRound, ShieldCheck } from 'lucide-react';
import { adminRequest } from '../services/api/adminClient';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AlertBanner, InfoBanner } from '../components/ui/AlertBanner';

const STEPS = ['Pair device', 'Confirm code', 'Save codes'];

type EnableResponse = {
  ok: boolean;
  recovery_codes?: string[];
  token: string;
  admin: { id: string; email: string; role: string; mfa_enabled?: boolean };
  permissions: string[];
};

export function MfaSetupPage() {
  const { mustEnrollMfa, mfaEnabled, completeMfaEnrollment } = useAdminAuth();
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [totp, setTotp] = useState('');
  // Proof of the current factor, needed to replace an existing authenticator.
  const [currentTotp, setCurrentTotp] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<'secret' | 'url' | 'codes' | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const step = !secret ? 0 : done ? 2 : 1;
  const reenroll = mfaEnabled && !done;

  // QR is drawn in the browser: the TOTP secret never leaves this page for a third-party service.
  useEffect(() => {
    let cancelled = false;
    if (!otpauthUrl) {
      setQrDataUrl('');
      return;
    }
    QRCode.toDataURL(otpauthUrl, { width: 200, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [otpauthUrl]);

  function currentFactor() {
    if (!reenroll) return {};
    return currentTotp ? { current_totp: currentTotp } : password ? { password } : {};
  }

  async function setup() {
    setError('');
    if (reenroll && !currentTotp && !password) {
      setError('Enter a code from your current authenticator (or your password) first.');
      return;
    }
    setLoading(true);
    try {
      const res = await adminRequest<{ secret: string; otpauth_url: string }>('/admin/auth/mfa/setup', {
        method: 'POST',
        body: JSON.stringify(currentFactor()),
      });
      setSecret(res.secret);
      setOtpauthUrl(res.otpauth_url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  async function enable(e: FormEvent) {
    e.preventDefault();
    if (!secret || !/^\d{6}$/.test(totp)) {
      setError('Enter the 6-digit code from your authenticator');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await adminRequest<EnableResponse>('/admin/auth/mfa/enable', {
        method: 'POST',
        body: JSON.stringify({ secret, totp, ...currentFactor() }),
      });
      setRecoveryCodes(res.recovery_codes || []);
      setDone(true);
      setCurrentTotp('');
      setPassword('');
      // The server returns a full session now that MFA is on.
      completeMfaEnrollment({ token: res.token, admin: res.admin, permissions: res.permissions });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enable failed');
    } finally {
      setLoading(false);
    }
  }

  async function copy(kind: 'secret' | 'url' | 'codes', value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError('Copy failed — select the text and copy it manually.');
    }
  }

  return (
    <div>
      <PageHeader
        title="MFA Settings"
        subtitle={
          mustEnrollMfa
            ? 'Set up two-factor authentication to use the console'
            : 'Secure your admin account with two-factor authentication'
        }
      />
      {mustEnrollMfa && (
        <InfoBanner message="Two-factor authentication is required for every admin. Until it is set up, the rest of the console stays locked." />
      )}
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      <ol className="mb-8 flex flex-wrap items-center gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2" aria-current={i === step ? 'step' : undefined}>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                i <= step ? 'bg-brand-600 text-white' : 'bg-stone-200 text-stone-500'
              }`}
            >
              {i < step ? <Check className="h-4 w-4" aria-hidden /> : i + 1}
            </div>
            <span className={`text-sm ${i <= step ? 'font-medium text-stone-800' : 'text-stone-400'}`}>{s}</span>
            {i < STEPS.length - 1 && (
              <div className={`mx-2 hidden h-0.5 w-12 sm:block ${i < step ? 'bg-brand-600' : 'bg-stone-200'}`} />
            )}
          </li>
        ))}
      </ol>

      <Card padding="lg" className="max-w-lg">
        {step === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
              <KeyRound className="h-6 w-6 text-brand-600" aria-hidden />
            </div>
            <p className="mb-6 text-sm text-stone-600">
              {reenroll
                ? 'Two-factor authentication is on. To move it to a new device, confirm with your current code first.'
                : 'Pair Google Authenticator, 1Password or a similar app with your admin account.'}
            </p>
            {reenroll && (
              <>
                <Field label="Code from your current authenticator">
                  <Input
                    value={currentTotp}
                    onChange={(e) => setCurrentTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="tracking-[0.3em]"
                  />
                </Field>
                <Field label="…or your password">
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </Field>
              </>
            )}
            <Button loading={loading} onClick={() => void setup()}>
              {reenroll ? 'Set up a new authenticator' : 'Start setup'}
            </Button>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <form onSubmit={enable}>
              <div className="mb-4 flex justify-center rounded-xl border border-stone-200 bg-white p-4">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR code to scan with your authenticator app" width={200} height={200} />
                ) : (
                  <div className="h-[200px] w-[200px] animate-pulse rounded bg-stone-100" aria-hidden />
                )}
              </div>
              <Field label="Can't scan? Enter this key">
                <div className="flex gap-2">
                  <Input value={secret} readOnly className="font-mono text-xs" aria-label="Setup key" />
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Copy setup key"
                    onClick={() => void copy('secret', secret)}
                  >
                    {copied === 'secret' ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                  </Button>
                </div>
              </Field>
              <Field label="6-digit code from the app">
                <Input
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="tracking-[0.3em]"
                  required
                />
              </Field>
              <Button type="submit" loading={loading}>
                Turn on two-factor
              </Button>
            </form>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="mb-4 flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <ShieldCheck className="h-8 w-8 text-emerald-600" aria-hidden />
              </div>
              <p className="font-semibold text-stone-800">Two-factor authentication is on</p>
              <p className="mt-1 text-sm text-stone-500">
                Save these recovery codes somewhere safe now. Each works once and they won't be shown again.
              </p>
            </div>
            {recoveryCodes.length > 0 && (
              <ul className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-4 font-mono text-sm">
                {recoveryCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
            <Button variant="outline" className="w-full" onClick={() => void copy('codes', recoveryCodes.join('\n'))}>
              {copied === 'codes' ? 'Copied' : 'Copy recovery codes'}
            </Button>
          </motion.div>
        )}
      </Card>
    </div>
  );
}
