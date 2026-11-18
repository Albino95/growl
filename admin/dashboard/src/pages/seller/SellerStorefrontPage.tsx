import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Clock, ExternalLink, ImagePlus, Link2, MapPin, Package, Plus, Trash2 } from 'lucide-react';
import { useSellerAuth } from '../../auth/SellerAuthProvider';
import {
  errorMessage,
  getSettings,
  getStorefront,
  getVerification,
  isFeatureUnavailable,
  listOwnPosts,
  listProducts,
  productImages,
  productStatus,
  saveStorefront,
  uploadImage,
  type CatalogProduct,
  type OwnPost,
  type Storefront,
  type StorefrontHours,
} from '../../services/api/sellerApi';
import CATEGORIES, { getCategoryLabel } from '../../data/categories';
import { formatEur } from '../../lib/sellerFormat';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import {
  ComingSoonBlock,
  ErrorBlock,
  IconButton,
  InlineNotice,
  LoadingBlock,
  useToast,
} from '../../components/seller/SellerUI';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const LIMITS = { tagline: 80, about: 1200, links: 4, tags: 3, featured: 6, location: 80, pickup: 200, shipping: 600, returns: 600, pickupPolicy: 400 };

type Errors = Record<string, string>;

function validate(s: Storefront): Errors {
  const e: Errors = {};
  if ((s.tagline || '').length > LIMITS.tagline) e.tagline = `Keep it under ${LIMITS.tagline} characters`;
  if ((s.about || '').length > LIMITS.about) e.about = `Keep it under ${LIMITS.about} characters`;
  if ((s.location_label || '').length > LIMITS.location) e.location_label = `Keep it under ${LIMITS.location} characters`;
  if ((s.pickup_note || '').length > LIMITS.pickup) e.pickup_note = `Keep it under ${LIMITS.pickup} characters`;
  s.links.forEach((l, i) => {
    if (!l.label.trim()) e[`link-${i}`] = 'Add a label';
    else if (!/^https:\/\/[^\s.]+\.[^\s]+$/i.test(l.url.trim())) e[`link-${i}`] = 'Use a full https:// address';
  });
  s.hours.forEach((h) => {
    if (!/^\d{2}:\d{2}$/.test(h.open) || !/^\d{2}:\d{2}$/.test(h.close) || h.open >= h.close)
      e[`hours-${h.day}`] = 'Closing time must be after opening time';
  });
  if ((s.policies.shipping || '').length > LIMITS.shipping) e.shipping = `Keep it under ${LIMITS.shipping} characters`;
  if ((s.policies.returns || '').length > LIMITS.returns) e.returns = `Keep it under ${LIMITS.returns} characters`;
  if ((s.policies.pickup || '').length > LIMITS.pickupPolicy) e.pickup = `Keep it under ${LIMITS.pickupPolicy} characters`;
  return e;
}

function Counter({ value, max }: { value: string | null | undefined; max: number }) {
  const n = (value || '').length;
  return <span className={`text-xs ${n > max ? 'text-red-600' : 'text-stone-400'}`}>{n}/{max}</span>;
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null;
}

export function SellerStorefrontPage() {
  const toast = useToast();
  const { seller } = useSellerAuth();
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState<Storefront | null>(null);
  const [draft, setDraft] = useState<Storefront | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [posts, setPosts] = useState<OwnPost[]>([]);
  const [brand, setBrand] = useState<{ name: string; logo: string | null }>({ name: '', logo: null });
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const coverRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const sf = await getStorefront();
      setSaved(sf);
      setDraft(sf);
      setState('ready');
    } catch (e) {
      if (isFeatureUnavailable(e)) setState('unavailable');
      else {
        setLoadError(errorMessage(e, 'Failed to load your storefront'));
        setState('error');
      }
      return;
    }
    // Supporting data — each optional.
    const [prods, settings, ver] = await Promise.all([
      listProducts().catch(() => [] as CatalogProduct[]),
      getSettings().catch(() => null),
      getVerification().catch(() => null),
    ]);
    setProducts(prods);
    setBrand({ name: settings?.business_name || '', logo: settings?.logo_url || null });
    setVerified(ver?.status === 'verified');
    if (seller?.userId && seller.userId !== 'unknown') {
      listOwnPosts(seller.userId)
        .then((p) => setPosts(p.slice(0, 30)))
        .catch(() => undefined);
    }
  }, [seller?.userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);
  const errors = useMemo(() => (draft ? validate(draft) : {}), [draft]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  function patch(p: Partial<Storefront>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }

  async function onCover(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast('Use a JPG, PNG or WebP image', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('Cover images can be up to 5 MB', 'error');
      return;
    }
    setUploading(true);
    try {
      const url = await uploadImage(file);
      patch({ cover_url: url });
    } catch (e) {
      toast(errorMessage(e, 'Upload failed'), 'error');
    } finally {
      setUploading(false);
      if (coverRef.current) coverRef.current.value = '';
    }
  }

  async function onSave() {
    if (!draft) return;
    if (Object.keys(errors).length) {
      setShowErrors(true);
      toast('Check the highlighted fields', 'error');
      return;
    }
    setSaving(true);
    try {
      const body: Partial<Storefront> = {
        ...draft,
        tagline: draft.tagline?.trim() || '',
        about: draft.about?.trim() || '',
        links: draft.links.map((l) => ({ label: l.label.trim(), url: l.url.trim() })),
        hours: [...draft.hours].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day)),
      };
      const next = await saveStorefront(body);
      setSaved(next);
      setDraft(next);
      setShowErrors(false);
      toast('Storefront saved — it’s live in the app');
    } catch (e) {
      toast(errorMessage(e, 'Save failed'), 'error');
    } finally {
      setSaving(false);
    }
  }

  const activeProducts = products.filter((p) => productStatus(p) === 'active');
  const shownError = (k: string) => (showErrors ? errors[k] : undefined);

  if (state === 'loading')
    return (
      <div>
        <PageHeader title="Storefront" subtitle="Your business page in Grow!" />
        <Card className="!p-0">
          <LoadingBlock rows={6} />
        </Card>
      </div>
    );
  if (state === 'unavailable')
    return (
      <div>
        <PageHeader title="Storefront" subtitle="Your business page in Grow!" />
        <Card>
          <ComingSoonBlock feature="The storefront editor" />
        </Card>
      </div>
    );
  if (state === 'error' || !draft)
    return (
      <div>
        <PageHeader title="Storefront" subtitle="Your business page in Grow!" />
        <Card>
          <ErrorBlock message={loadError} onRetry={() => void load()} />
        </Card>
      </div>
    );

  function toggleDay(day: number) {
    if (!draft) return;
    const has = draft.hours.find((h) => h.day === day);
    patch({
      hours: has ? draft.hours.filter((h) => h.day !== day) : [...draft.hours, { day, open: '09:00', close: '18:00' }],
    });
  }
  function setHour(day: number, key: 'open' | 'close', value: string) {
    if (!draft) return;
    patch({ hours: draft.hours.map((h) => (h.day === day ? { ...h, [key]: value } : h)) });
  }

  return (
    <div>
      <PageHeader
        title="Storefront"
        subtitle="What people see when they open your business page in Grow!"
        action={
          <div className="flex flex-wrap items-center gap-2">
            {dirty && <span className="text-xs font-medium text-amber-700">Unsaved changes</span>}
            <Link
              to="/seller/storefront/view"
              className="focus-ring inline-flex items-center gap-2 rounded-lg border border-surface-border bg-surface px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-surface-page"
            >
              <ExternalLink className="h-4 w-4" aria-hidden /> View storefront
            </Link>
            <Button variant="ghost" disabled={!dirty || saving} onClick={() => setDraft(saved)}>
              Discard
            </Button>
            <Button loading={saving} disabled={!dirty} onClick={() => void onSave()}>
              Save
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card padding="lg">
            <h2 className="mb-4 font-semibold text-stone-900">Look & intro</h2>
            <Field label="Cover image">
              <div className="relative overflow-hidden rounded-xl border border-surface-border bg-surface-page">
                {draft.cover_url ? (
                  <img src={draft.cover_url} alt="Storefront cover" className="aspect-[3/1] w-full object-cover" />
                ) : (
                  <div className="flex aspect-[3/1] items-center justify-center text-sm text-stone-400">No cover yet</div>
                )}
                <div className="absolute bottom-2 right-2 flex gap-2">
                  <Button variant="outline" loading={uploading} onClick={() => coverRef.current?.click()}>
                    <ImagePlus className="h-4 w-4" aria-hidden /> {draft.cover_url ? 'Change' : 'Upload'}
                  </Button>
                  {draft.cover_url && (
                    <Button variant="outline" onClick={() => patch({ cover_url: null })}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
              <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Upload cover image" onChange={(e) => void onCover(e.target.files?.[0])} />
              <p className="mt-1 text-xs text-stone-500">Wide images work best (3:1, at least 1500 px wide).</p>
            </Field>
            <Field label="Tagline">
              <Input value={draft.tagline || ''} onChange={(e) => patch({ tagline: e.target.value })} placeholder="Handmade yoga gear from Luxembourg" />
              <div className="mt-1 flex justify-between">
                <FieldError msg={shownError('tagline')} />
                <span className="ml-auto">
                  <Counter value={draft.tagline} max={LIMITS.tagline} />
                </span>
              </div>
            </Field>
            <Field label="About">
              <Textarea rows={5} value={draft.about || ''} onChange={(e) => patch({ about: e.target.value })} placeholder="Who you are, what you make, why it helps people grow." />
              <div className="mt-1 flex justify-between">
                <FieldError msg={shownError('about')} />
                <span className="ml-auto">
                  <Counter value={draft.about} max={LIMITS.about} />
                </span>
              </div>
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium text-stone-600">Growth paths ({draft.path_tags.length}/{LIMITS.tags})</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Growth paths">
                {CATEGORIES.map((c) => {
                  const on = draft.path_tags.includes(c.key);
                  const full = !on && draft.path_tags.length >= LIMITS.tags;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={on}
                      disabled={full}
                      onClick={() =>
                        patch({ path_tags: on ? draft.path_tags.filter((t) => t !== c.key) : [...draft.path_tags, c.key] })
                      }
                      className={`focus-ring rounded-full px-3 py-1 text-sm font-medium transition-colors disabled:opacity-40 ${
                        on ? 'bg-brand-600 text-white' : 'bg-surface-page text-stone-600 hover:bg-surface-muted'
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-stone-900">Featured products</h2>
              <span className="text-xs text-stone-500">
                {draft.featured_product_ids.length}/{LIMITS.featured} · active products only
              </span>
            </div>
            {activeProducts.length === 0 ? (
              <p className="text-sm text-stone-500">
                No active products yet. <Link to="/seller/products" className="font-medium text-brand-700 hover:underline">Add one</Link> to feature it here.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {activeProducts.slice(0, 60).map((p) => {
                  const idx = draft.featured_product_ids.indexOf(p.id);
                  const on = idx >= 0;
                  const full = !on && draft.featured_product_ids.length >= LIMITS.featured;
                  const cover = productImages(p)[0];
                  return (
                    <li key={p.id}>
                      <label className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2 transition-colors ${on ? 'border-brand-600 bg-brand-50' : 'border-surface-border hover:bg-surface-page'} ${full ? 'cursor-not-allowed opacity-50' : ''}`}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-600"
                          checked={on}
                          disabled={full}
                          onChange={() =>
                            patch({
                              featured_product_ids: on
                                ? draft.featured_product_ids.filter((x) => x !== p.id)
                                : [...draft.featured_product_ids, p.id],
                            })
                          }
                        />
                        {cover ? <img src={cover} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <div className="h-9 w-9 rounded-lg bg-surface-muted" aria-hidden />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="text-xs text-stone-500">{formatEur(p.price)}</span>
                        </span>
                        {on && <span className="text-xs font-semibold text-brand-700">#{idx + 1}</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-5">
              <Field label="Pinned post">
                <Select value={draft.pinned_post_id || ''} onChange={(e) => patch({ pinned_post_id: e.target.value || null })}>
                  <option value="">No pinned post</option>
                  {draft.pinned_post_id && !posts.some((p) => p.id === draft.pinned_post_id) && (
                    <option value={draft.pinned_post_id}>Current pinned post</option>
                  )}
                  {posts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p.caption || 'Photo post').slice(0, 70)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card padding="lg">
            <h2 className="mb-4 font-semibold text-stone-900">Links</h2>
            <div className="space-y-3">
              {draft.links.map((l, i) => (
                <div key={i}>
                  <div className="flex gap-2">
                    <Input
                      aria-label={`Link ${i + 1} label`}
                      className="!w-40"
                      value={l.label}
                      maxLength={40}
                      placeholder="Website"
                      onChange={(e) => patch({ links: draft.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })}
                    />
                    <Input
                      aria-label={`Link ${i + 1} address`}
                      value={l.url}
                      placeholder="https://"
                      onChange={(e) => patch({ links: draft.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })}
                    />
                    <IconButton label={`Remove link ${i + 1}`} icon={Trash2} tone="danger" onClick={() => patch({ links: draft.links.filter((_, j) => j !== i) })} />
                  </div>
                  <FieldError msg={shownError(`link-${i}`)} />
                </div>
              ))}
            </div>
            {draft.links.length < LIMITS.links && (
              <Button variant="outline" className="mt-3" onClick={() => patch({ links: [...draft.links, { label: '', url: 'https://' }] })}>
                <Plus className="h-4 w-4" aria-hidden /> Add link
              </Button>
            )}
          </Card>

          <Card padding="lg">
            <h2 className="mb-4 font-semibold text-stone-900">Location & hours</h2>
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Field label="Location">
                <Input value={draft.location_label || ''} maxLength={LIMITS.location} placeholder="Luxembourg City" onChange={(e) => patch({ location_label: e.target.value })} />
              </Field>
              <Field label="Pickup note">
                <Input value={draft.pickup_note || ''} maxLength={LIMITS.pickup} placeholder="Pick up at our studio, rue …" onChange={(e) => patch({ pickup_note: e.target.value })} />
              </Field>
            </div>
            <p className="mb-2 text-sm font-medium text-stone-600">Opening hours</p>
            <ul className="divide-y divide-surface-border rounded-xl border border-surface-border">
              {DAY_ORDER.map((day) => {
                const h = draft.hours.find((x) => x.day === day);
                return (
                  <li key={day} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <label className="flex w-32 items-center gap-2 text-sm">
                      <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={!!h} onChange={() => toggleDay(day)} />
                      {DAYS[day]}
                    </label>
                    {h ? (
                      <>
                        <Input type="time" aria-label={`${DAYS[day]} opens`} className="!w-32" value={h.open} onChange={(e) => setHour(day, 'open', e.target.value)} />
                        <span className="text-stone-400">–</span>
                        <Input type="time" aria-label={`${DAYS[day]} closes`} className="!w-32" value={h.close} onChange={(e) => setHour(day, 'close', e.target.value)} />
                        <FieldError msg={errors[`hours-${day}`]} />
                      </>
                    ) : (
                      <span className="text-sm text-stone-400">Closed</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card padding="lg">
            <h2 className="mb-4 font-semibold text-stone-900">Policies</h2>
            {(
              [
                ['shipping', 'Shipping', LIMITS.shipping, 'Where you ship, how long it takes, costs.'],
                ['returns', 'Returns', LIMITS.returns, 'How and when people can return items.'],
                ['pickup', 'Pickup', LIMITS.pickupPolicy, 'If people can collect orders in person.'],
              ] as const
            ).map(([key, label, max, ph]) => (
              <Field key={key} label={label}>
                <Textarea rows={3} value={draft.policies[key] || ''} placeholder={ph} onChange={(e) => patch({ policies: { ...draft.policies, [key]: e.target.value } })} />
                <div className="mt-1 flex justify-between">
                  <FieldError msg={shownError(key)} />
                  <span className="ml-auto">
                    <Counter value={draft.policies[key]} max={max} />
                  </span>
                </div>
              </Field>
            ))}
          </Card>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Live preview</p>
          <StorefrontPreview
            storefront={draft}
            name={brand.name}
            logo={brand.logo}
            verified={verified}
            featured={draft.featured_product_ids
              .map((id) => products.find((p) => p.id === id))
              .filter((p): p is CatalogProduct => !!p)}
          />
          {!verified && (
            <div className="mt-3">
              <InlineNotice>
                Get a verified badge on your page. <Link to="/seller/verification" className="font-semibold underline">Request verification</Link>
              </InlineNotice>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function hoursSummary(hours: StorefrontHours[]): string[] {
  return DAY_ORDER.filter((d) => hours.some((h) => h.day === d)).map((d) => {
    const h = hours.find((x) => x.day === d)!;
    return `${DAYS[d].slice(0, 3)} ${h.open}–${h.close}`;
  });
}

/** Phone-sized preview mirroring the app's business page layout. */
export function StorefrontPreview({
  storefront,
  name,
  logo,
  verified,
  featured,
}: {
  storefront: Storefront;
  name: string;
  logo: string | null;
  verified: boolean;
  featured: Array<{ id: string; name: string; price: number; image_url?: string | null; images?: string[] }>;
}) {
  const hrs = hoursSummary(storefront.hours);
  return (
    <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[28px] border-4 border-stone-800 bg-[#FFFcf7] shadow-xl" aria-label="Storefront preview">
      <div className="relative">
        {storefront.cover_url ? (
          <img src={storefront.cover_url} alt="" className="aspect-[3/1] w-full object-cover" />
        ) : (
          <div className="aspect-[3/1] w-full bg-gradient-to-br from-emerald-100 to-amber-50" />
        )}
        <div className="absolute -bottom-7 left-4 h-14 w-14 overflow-hidden rounded-2xl bg-white ring-4 ring-[#FFFcf7]">
          {logo ? <img src={logo} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-brand-600 text-lg font-bold text-white">{(name || 'B').charAt(0)}</div>}
        </div>
      </div>
      <div className="px-4 pb-5 pt-9">
        <p className="flex items-center gap-1 text-lg font-bold text-stone-900">
          {name || 'Your business'}
          {verified && <BadgeCheck className="h-4 w-4 text-brand-600" aria-label="Verified" />}
        </p>
        {storefront.tagline && <p className="text-sm text-stone-600">{storefront.tagline}</p>}
        {storefront.path_tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {storefront.path_tags.map((t) => (
              <span key={t} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                {getCategoryLabel(t)}
              </span>
            ))}
          </div>
        )}
        {storefront.about && <p className="mt-3 line-clamp-4 whitespace-pre-line text-[13px] leading-relaxed text-stone-700">{storefront.about}</p>}
        {storefront.links.filter((l) => l.label).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {storefront.links
              .filter((l) => l.label)
              .map((l, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full border border-surface-border bg-white px-2.5 py-1 text-[11px] font-medium text-stone-700">
                  <Link2 className="h-3 w-3" aria-hidden /> {l.label}
                </span>
              ))}
          </div>
        )}
        {(storefront.location_label || hrs.length > 0) && (
          <div className="mt-3 space-y-1 text-[12px] text-stone-600">
            {storefront.location_label && (
              <p className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden /> {storefront.location_label}
              </p>
            )}
            {hrs.length > 0 && (
              <p className="flex items-start gap-1">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {hrs.join(' · ')}
              </p>
            )}
          </div>
        )}
        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-stone-500">Featured</p>
        {featured.length === 0 ? (
          <p className="mt-1 text-[12px] text-stone-400">Pick up to 6 products to feature.</p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {featured.map((p) => {
              const img = p.image_url || p.images?.[0];
              return (
                <div key={p.id} className="overflow-hidden rounded-xl bg-white ring-1 ring-surface-border">
                  {img ? <img src={img} alt="" className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center bg-surface-muted"><Package className="h-5 w-5 text-stone-400" aria-hidden /></div>}
                  <div className="p-2">
                    <p className="truncate text-[12px] font-medium">{p.name}</p>
                    <p className="text-[11px] text-stone-500">{formatEur(p.price)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
