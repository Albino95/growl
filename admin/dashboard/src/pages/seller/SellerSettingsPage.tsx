import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ImagePlus } from 'lucide-react';
import { sellerRequest } from '../../services/api/sellerClient';
import { errorMessage, getSettings, uploadImage, type BusinessSettings } from '../../services/api/sellerApi';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Field, Input, Textarea } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { ErrorBlock, InlineNotice, LoadingBlock, useToast } from '../../components/seller/SellerUI';

const SHIPPING_MAX = 300;

export function SellerSettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [name, setName] = useState('');
  const [logo, setLogo] = useState('');
  const [threshold, setThreshold] = useState('10');
  const [shippingNote, setShippingNote] = useState('');
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const s = await getSettings();
      setSettings(s);
      setName(s.business_name || '');
      setLogo(s.logo_url || '');
      setThreshold(String(s.analytics_prefs?.low_stock_threshold ?? 10));
      setShippingNote(String(s.analytics_prefs?.default_shipping_note ?? ''));
    } catch (e) {
      setLoadError(errorMessage(e, 'Failed to load settings'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onLogo(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      toast('Use a JPG, PNG or WebP image up to 5 MB', 'error');
      return;
    }
    setUploading(true);
    try {
      setLogo(await uploadImage(file));
    } catch (e) {
      toast(errorMessage(e, 'Upload failed'), 'error');
    } finally {
      setUploading(false);
      if (logoRef.current) logoRef.current.value = '';
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setFormError('');
    const t = Number(threshold);
    if (!name.trim()) return setFormError('Add your business name.');
    if (!Number.isInteger(t) || t < 1 || t > 10000) return setFormError('Low-stock alert must be a whole number from 1.');
    if (logo && !/^https?:\/\//i.test(logo)) return setFormError('Logo must be an uploaded image or a full https:// link.');
    if (shippingNote.length > SHIPPING_MAX) return setFormError(`Keep the shipping note under ${SHIPPING_MAX} characters.`);
    setSaving(true);
    try {
      await sellerRequest('/business/settings', {
        method: 'PUT',
        body: JSON.stringify({
          business_name: name.trim(),
          logo_url: logo || '',
          analytics_prefs: {
            ...(settings?.analytics_prefs || {}),
            low_stock_threshold: t,
            default_shipping_note: shippingNote.trim(),
          },
        }),
      });
      toast('Settings saved');
    } catch (err) {
      setFormError(errorMessage(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" subtitle="Your business profile in Grow!. Push alerts are set in the mobile app." />
      <Card padding="lg" className="max-w-2xl">
        {loading ? (
          <LoadingBlock rows={3} />
        ) : loadError ? (
          <ErrorBlock message={loadError} onRetry={() => void load()} />
        ) : (
          <form onSubmit={onSave} noValidate>
            <Field label="Business name">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
            </Field>
            <div className="mb-4">
              <p className="mb-1.5 text-sm font-medium text-stone-600">Logo</p>
              <div className="flex items-center gap-4">
                {logo ? (
                  <img src={logo} alt="Your logo" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-surface-border" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-muted text-xl font-bold text-stone-400" aria-hidden>
                    {(name || 'B').charAt(0)}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" loading={uploading} onClick={() => logoRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" aria-hidden /> {logo ? 'Change' : 'Upload'}
                  </Button>
                  {logo && (
                    <Button variant="ghost" onClick={() => setLogo('')}>
                      Remove
                    </Button>
                  )}
                </div>
                <input ref={logoRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Upload logo" onChange={(e) => void onLogo(e.target.files?.[0])} />
              </div>
            </div>
            <Field label="Shipping note">
              <Textarea
                rows={3}
                value={shippingNote}
                onChange={(e) => setShippingNote(e.target.value)}
                placeholder="We ship within 2 working days from Luxembourg. Free over €50."
              />
              <p className={`mt-1 text-right text-xs ${shippingNote.length > SHIPPING_MAX ? 'text-red-600' : 'text-stone-400'}`}>
                {shippingNote.length}/{SHIPPING_MAX}
              </p>
            </Field>
            <Field label="Low-stock alert (units)">
              <Input type="number" min={1} className="!w-32" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </Field>
            {formError && (
              <div className="mb-4">
                <InlineNotice tone="warn">{formError}</InlineNotice>
              </div>
            )}
            <Button type="submit" loading={saving} disabled={uploading}>
              Save settings
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
