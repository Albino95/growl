import { FormEvent, useState } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, KeyRound, ShieldCheck } from 'lucide-react';
import { adminRequest } from '../services/api/adminClient';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { AlertBanner, SuccessBanner } from '../components/ui/AlertBanner';

const STEPS = ['Pair device', 'Confirm code', 'Save codes'];

export function MfaSetupPage() {
  const { mustEnrollMfa, clearMustEnrollMfa } = useAdminAuth();
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [totp, setTotp] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<'secret' | 'url' | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const step = !secret ? 0 : recoveryCodes.length || message.includes('success') ? 2 : 1;

  async function setup() {
    setError('');
    setLoading(true);
    try {
      const res = await adminRequest<{ secret: string; otpauth_url: string }>('/admin/auth/mfa/setup', {
        method: 'POST',
        body: '{}',
      });
      setSecret(res.secret);
      setOtpauthUrl(res.otpauth_url);
      setMessage('Scan the QR (or paste OTPAuth URL) in your authenticator, then enter a code below.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  }

  async function enable(e: FormEvent) {
    e.preventDefault();
    if (!secret || totp.length !== 6) {
      setError('Enter a valid 6-digit TOTP code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await adminRequest<{ ok: boolean; recovery_codes?: string[] }>('/admin/auth/mfa/enable', {
        method: 'POST',
        body: JSON.stringify({ secret, totp }),
      });
      setRecoveryCodes(res.recovery_codes || []);
      setMessage('MFA enabled successfully. Store recovery codes offline — they are shown once.');
      clearMustEnrollMfa();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enable failed');
    } finally {
      setLoading(false);
    }
  }

  async function copy(kind: 'secret' | 'url', value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  const qrSrc = otpauthUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(otpauthUrl)}`
    : '';

  return (
    <div>
      <PageHeader
        title="MFA Settings"
        subtitle={
          mustEnrollMfa
            ? 'Enrollment required before using the rest of the console'
            : 'Secure your admin account with two-factor authentication'
        }
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}
      {message.includes('success') && <SuccessBanner message={message} />}

      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                i <= step ? 'bg-brand-600 text-white' : 'bg-stone-200 text-stone-500'
              }`}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-sm ${i <= step ? 'font-medium text-stone-800' : 'text-stone-400'}`}>{s}</span>
            {i < STEPS.length - 1 && (
              <div className={`mx-2 h-0.5 w-12 ${i < step ? 'bg-brand-600' : 'bg-stone-200'}`} />
            )}
          </div>
        ))}
      </div>

      <Card padding="lg" className="max-w-lg">
        {step === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50">
              <KeyRound className="h-6 w-6 text-brand-600" />
            </div>
            <p className="mb-6 text-sm text-stone-600">
              Generate a TOTP secret to pair with Google Authenticator, 1Password, or similar apps.
            </p>
            <Button loading={loading} onClick={() => void setup()}>
              Generate MFA secret
            </Button>
          </motion.div>
        )}

        {step >= 1 && step < 2 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <form onSubmit={enable}>
              {qrSrc ? (
                <div className="mb-4 flex justify-center rounded-xl border border-stone-200 bg-white p-4">
                  <img src={qrSrc} alt="MFA QR code" width={180} height={180} />
                </div>
              ) : null}
              <Field label="Secret (manual entry)">
                <div className="flex gap-2">
                  <Input value={secret} readOnly className="font-mono text-xs" />
                  <Button type="button" variant="outline" onClick={() => void copy('secret', secret)}>
                    {copied === 'secret' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </Field>
              {otpauthUrl && (
                <Field label="OTPAuth URL">
                  <div className="flex gap-2">
                    <Input value={otpauthUrl} readOnly className="text-xs" />
                    <Button type="button" variant="outline" onClick={() => void copy('url', otpauthUrl)}>
                      {copied === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </Field>
              )}
              <Field label="6-digit verification code">
                <Input
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                  maxLength={6}
                  className="tracking-[0.3em]"
                  required
                />
              </Field>
              <Button type="submit" loading={loading}>
                Enable MFA
              </Button>
            </form>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="mb-4 flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <ShieldCheck className="h-8 w-8 text-emerald-600" />
              </div>
              <p className="font-semibold text-stone-800">Two-factor authentication is active</p>
              <p className="mt-1 text-sm text-stone-500">Save these recovery codes now. Each works once.</p>
            </div>
            {recoveryCodes.length > 0 && (
              <ul className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-stone-50 p-4 font-mono text-sm">
                {recoveryCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void navigator.clipboard.writeText(recoveryCodes.join('\n'))}
            >
              Copy recovery codes
            </Button>
          </motion.div>
        )}
      </Card>
    </div>
  );
}
