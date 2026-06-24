import { FormEvent, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigate } from 'react-router-dom';
import { Shield, Mail, Lock, KeyRound } from 'lucide-react';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { AdminApiError } from '../services/api/adminClient';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Input';
import { AlertBanner } from '../components/ui/AlertBanner';

export function LoginPage() {
  const { admin, login } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(false);

  if (admin) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password, totp || undefined);
    } catch (err) {
      if (err instanceof AdminApiError && err.code === 'MFA_REQUIRED') {
        setMfaRequired(true);
        setError('Enter the 6-digit code from your authenticator app.');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-600/20 via-transparent to-transparent" />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="relative w-full max-w-md"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/40">
            <Shield className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Growl Admin</h1>
          <p className="mt-1 text-sm text-slate-400">Sign in to the operations console</p>
        </div>

        <Card padding="lg" className="border-slate-200/60 shadow-xl">
          {error && <AlertBanner message={error} onDismiss={() => setError('')} />}
          <form onSubmit={onSubmit}>
            <Field label="Email">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="email"
                  className="pl-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </Field>
            <Field label="Password">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="password"
                  className="pl-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </Field>
            <AnimatePresence>
              {(mfaRequired || totp) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <Field label={mfaRequired ? 'Authenticator code (required)' : 'TOTP (if MFA enabled)'}>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        className="pl-10 tracking-widest"
                        value={totp}
                        onChange={(e) => setTotp(e.target.value)}
                        placeholder="123456"
                        maxLength={6}
                        autoFocus={mfaRequired}
                        required={mfaRequired}
                      />
                    </div>
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>
            <Button type="submit" loading={loading} className="mt-2 w-full">
              Sign in
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
