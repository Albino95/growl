import { FormEvent, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navigate } from 'react-router-dom';
import { Shield, Mail, Lock, KeyRound, Store } from 'lucide-react';
import { useAdminAuth } from '../auth/AdminAuthProvider';
import { useSellerAuth } from '../auth/SellerAuthProvider';
import { AdminApiError } from '../services/api/adminClient';
import { SellerApiError, sellerForgotPassword } from '../services/api/sellerClient';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field, Input } from '../components/ui/Input';
import { AlertBanner } from '../components/ui/AlertBanner';

type Mode = 'staff' | 'seller';

export function LoginPage() {
  const { admin, login: staffLogin } = useAdminAuth();
  const { seller, login: sellerLogin } = useSellerAuth();
  const [mode, setMode] = useState<Mode>('staff');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  if (admin) return <Navigate to="/" replace />;
  if (seller) return <Navigate to="/seller" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'staff') {
        await staffLogin(email, password, totp || undefined);
      } else {
        await sellerLogin(email, password);
      }
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

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const res = await sellerForgotPassword(email);
      setInfo(res.message + (res.devResetCode ? ` Dev code: ${res.devResetCode}` : ''));
      setForgotOpen(false);
    } catch (err) {
      setError(err instanceof SellerApiError ? err.message : 'Request failed');
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
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 shadow-lg shadow-emerald-600/40">
            {mode === 'staff' ? (
              <Shield className="h-7 w-7 text-white" />
            ) : (
              <Store className="h-7 w-7 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white">
            Grow<span className="text-emerald-400">!</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {mode === 'staff' ? 'Staff operations console' : 'Business seller portal'}
          </p>
        </div>

        <Card padding="lg" className="border-slate-200/60 shadow-xl">
          <div className="mb-5 flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => {
                setMode('staff');
                setError('');
                setForgotOpen(false);
                setMfaRequired(false);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'staff' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Staff
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('seller');
                setError('');
                setMfaRequired(false);
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
                mode === 'seller' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Seller
            </button>
          </div>

          {error && <AlertBanner message={error} onDismiss={() => setError('')} />}
          {info && <AlertBanner message={info} onDismiss={() => setInfo('')} />}

          {forgotOpen && mode === 'seller' ? (
            <form onSubmit={onForgot}>
              <p className="mb-3 text-sm text-slate-600">
                We&apos;ll email a reset code if this business account exists.
              </p>
              <Field label="Email">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </Field>
              <Button type="submit" loading={loading} className="w-full">
                Send reset email
              </Button>
              <button
                type="button"
                className="mt-3 w-full text-center text-sm text-emerald-700"
                onClick={() => setForgotOpen(false)}
              >
                Back to sign in
              </button>
            </form>
          ) : (
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
                {mode === 'staff' && (mfaRequired || totp) && (
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
              {mode === 'seller' && (
                <button
                  type="button"
                  className="mt-3 w-full text-center text-sm text-emerald-700 hover:underline"
                  onClick={() => setForgotOpen(true)}
                >
                  Forgot password?
                </button>
              )}
            </form>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
