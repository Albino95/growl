import { FormEvent, useEffect, useState } from 'react';
import { sellerRequest } from '../../services/api/sellerClient';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Field, Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { AlertBanner } from '../../components/ui/AlertBanner';

type Settings = {
  business_name: string;
  logo_url: string | null;
  analytics_prefs: Record<string, unknown>;
  notifications_prefs: Record<string, unknown>;
};

export function SellerSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [threshold, setThreshold] = useState('10');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sellerRequest<Settings>('/business/settings')
      .then((s) => {
        setSettings(s);
        setName(s.business_name || '');
        setLogo(s.logo_url || '');
        setThreshold(String(s.analytics_prefs?.low_stock_threshold ?? 10));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setOk('');
    try {
      await sellerRequest('/business/settings', {
        method: 'PUT',
        body: JSON.stringify({
          business_name: name,
          logo_url: logo || '',
          analytics_prefs: {
            ...(settings?.analytics_prefs || {}),
            low_stock_threshold: Number(threshold) || 10,
          },
        }),
      });
      setOk('Settings saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Store profile for your Grow! business. Use the mobile app for camera uploads and push alerts."
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}
      {ok && <AlertBanner message={ok} onDismiss={() => setOk('')} />}

      <Card padding="lg" className="max-w-xl">
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <form onSubmit={onSave}>
            <Field label="Display name">
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field label="Logo URL">
              <Input
                value={logo}
                onChange={(e) => setLogo(e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Low-stock threshold">
              <Input
                type="number"
                min={1}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </Field>
            <Button type="submit" loading={saving}>
              Save
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
