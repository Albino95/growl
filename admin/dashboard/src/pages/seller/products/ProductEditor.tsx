import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Star, Trash2 } from 'lucide-react';
import CATEGORIES from '../../../data/categories';
import {
  bulkUpdateProducts,
  createProduct,
  errorMessage,
  productImages,
  productSku,
  productStatus,
  updateProduct,
  uploadProductImage,
  type CatalogProduct,
} from '../../../services/api/sellerApi';
import { parseLocaleNumber } from '../../../lib/sellerFormat';
import { Button } from '../../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../../components/ui/Input';
import { IconButton, InlineNotice, Modal, useToast } from '../../../components/seller/SellerUI';

const MAX_IMAGES = 8;
const MAX_BYTES = 5 * 1024 * 1024;

type Form = {
  name: string;
  description: string;
  category: string;
  subcategory: string;
  price: string;
  stock: string;
  sku: string;
  status: 'active' | 'hidden';
  images: string[];
};

function toForm(p: CatalogProduct | null): Form {
  if (!p) {
    return {
      name: '',
      description: '',
      category: 'fitness',
      subcategory: '',
      price: '',
      stock: '0',
      sku: '',
      status: 'active',
      images: [],
    };
  }
  const explicitSku = typeof p.metadata?.sku === 'string' ? (p.metadata.sku as string) : '';
  return {
    name: p.name,
    description: p.description || '',
    category: p.category,
    subcategory: p.subcategory || '',
    price: String(p.price),
    stock: String(p.stock),
    sku: explicitSku,
    status: productStatus(p) === 'hidden' ? 'hidden' : 'active',
    images: productImages(p),
  };
}

export function ProductEditor({
  open,
  product,
  onClose,
  onSaved,
}: {
  open: boolean;
  product: CatalogProduct | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<Form>(toForm(product));
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [formError, setFormError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const moderated = product ? productStatus(product) === 'moderated' : false;

  useEffect(() => {
    if (open) {
      setForm(toForm(product));
      setErrors({});
      setFormError('');
    }
  }, [open, product]);

  const subs = useMemo(() => CATEGORIES.find((c) => c.key === form.category)?.subcategories || [], [form.category]);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_IMAGES - form.images.length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) toast(`Up to ${MAX_IMAGES} photos per product`, 'error');
    for (const file of picked) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        toast(`${file.name}: use a JPG, PNG or WebP photo`, 'error');
        continue;
      }
      if (file.size > MAX_BYTES) {
        toast(`${file.name} is larger than 5 MB`, 'error');
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const url = await uploadProductImage(file);
        setForm((f) => ({ ...f, images: [...f.images, url].slice(0, MAX_IMAGES) }));
      } catch (e) {
        toast(errorMessage(e, `Couldn’t upload ${file.name}`), 'error');
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  function moveImage(i: number, dir: -1 | 1) {
    setForm((f) => {
      const next = [...f.images];
      const j = i + dir;
      if (j < 0 || j >= next.length) return f;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...f, images: next };
    });
  }

  function validate(): { price: number; stock: number } | null {
    const e: Partial<Record<keyof Form, string>> = {};
    const price = parseLocaleNumber(form.price);
    const stock = parseLocaleNumber(form.stock);
    if (!form.name.trim()) e.name = 'Give your product a name';
    else if (form.name.trim().length > 200) e.name = 'Keep the name under 200 characters';
    if (price === null || price <= 0) e.price = 'Enter a price above €0';
    else if (price > 1_000_000) e.price = 'That price is too high';
    if (stock === null || stock < 0 || !Number.isInteger(stock)) e.stock = 'Stock must be a whole number (0 or more)';
    if (form.sku && !/^[A-Za-z0-9._-]{1,64}$/.test(form.sku.trim()))
      e.sku = 'Letters, numbers, dots, dashes and underscores only';
    if (form.description.length > 2000) e.description = 'Keep the description under 2000 characters';
    setErrors(e);
    if (Object.keys(e).length) return null;
    return { price: price!, stock: stock! };
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    const nums = validate();
    if (!nums) return;
    setSaving(true);
    setFormError('');
    const metadata = { ...(product?.metadata || {}) } as Record<string, unknown>;
    if (form.sku.trim()) metadata.sku = form.sku.trim();
    else delete metadata.sku;
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      subcategory: form.subcategory || (product ? '' : undefined),
      price: Math.round(nums.price * 100) / 100,
      stock: nums.stock,
      image_url: form.images[0] ?? null,
      images: form.images,
      metadata,
    };
    try {
      let id = product?.id;
      if (product) {
        await updateProduct(product.id, payload);
      } else {
        const created = await createProduct({ ...payload, image_url: payload.image_url ?? undefined });
        id = created.id;
      }
      const currentStatus = product ? productStatus(product) : 'active';
      if (id && !moderated && form.status !== currentStatus) {
        await bulkUpdateProducts([{ id, status: form.status }]);
      }
      toast(product ? 'Product saved' : 'Product added');
      onSaved();
      onClose();
    } catch (e) {
      setFormError(errorMessage(e, 'Save failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={product ? 'Edit product' : 'New product'}
      description={product ? `SKU ${productSku(product)}` : 'Photos, price and stock — you can change everything later.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="product-form" loading={saving} disabled={uploading > 0}>
            {product ? 'Save changes' : 'Add product'}
          </Button>
        </>
      }
    >
      <form id="product-form" onSubmit={onSubmit} noValidate>
        {formError && (
          <div className="mb-4">
            <InlineNotice tone="warn">{formError}</InlineNotice>
          </div>
        )}
        {moderated && (
          <div className="mb-4">
            <InlineNotice tone="warn">
              The Grow! team has hidden this product after a review. You can still edit it; contact support to have it
              reviewed again.
            </InlineNotice>
          </div>
        )}

        <section aria-labelledby="photos-h" className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 id="photos-h" className="text-sm font-medium text-stone-600">
              Photos <span className="text-stone-400">({form.images.length}/{MAX_IMAGES})</span>
            </h3>
            <p className="text-xs text-stone-500">The first photo is the cover.</p>
          </div>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {form.images.map((url, i) => (
              <div key={url} className="group relative overflow-hidden rounded-xl border border-surface-border bg-surface-page">
                <img src={url} alt={`Product photo ${i + 1}`} className="aspect-square w-full object-cover" />
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold text-brand-700 shadow-sm">
                    <Star className="h-3 w-3" aria-hidden /> Cover
                  </span>
                )}
                <div className="absolute inset-x-1 bottom-1 flex justify-between rounded-lg bg-white/95 p-0.5 shadow-sm">
                  <IconButton label={`Move photo ${i + 1} earlier`} icon={ArrowLeft} disabled={i === 0} onClick={() => moveImage(i, -1)} />
                  <IconButton
                    label={`Remove photo ${i + 1}`}
                    icon={Trash2}
                    tone="danger"
                    onClick={() => set('images', form.images.filter((u) => u !== url))}
                  />
                  <IconButton
                    label={`Move photo ${i + 1} later`}
                    icon={ArrowRight}
                    disabled={i === form.images.length - 1}
                    onClick={() => moveImage(i, 1)}
                  />
                </div>
              </div>
            ))}
            {Array.from({ length: uploading }).map((_, i) => (
              <div key={`up-${i}`} className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-brand-600/40 bg-brand-50" role="status" aria-label="Uploading photo">
                <Loader2 className="h-5 w-5 animate-spin text-brand-600" aria-hidden />
              </div>
            ))}
            {form.images.length + uploading < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="focus-ring flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-stone-300 text-stone-500 transition-colors hover:border-brand-600 hover:bg-brand-50 hover:text-brand-700"
              >
                <ImagePlus className="h-5 w-5" aria-hidden />
                <span className="text-xs font-medium">Add photos</span>
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            aria-label="Upload product photos"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </section>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} aria-invalid={!!errors.name} />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="What it is, who it’s for, materials, sizes…"
              />
              {errors.description && <p className="mt-1 text-xs text-red-600">{errors.description}</p>}
            </Field>
          </div>
          <Field label="Growth path">
            <Select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, subcategory: '' }))}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Focus (optional)">
            <Select value={form.subcategory} onChange={(e) => set('subcategory', e.target.value)}>
              <option value="">None</option>
              {subs.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Price (€)">
            <Input inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} placeholder="24,90" aria-invalid={!!errors.price} />
            {errors.price && <p className="mt-1 text-xs text-red-600">{errors.price}</p>}
          </Field>
          <Field label="Stock">
            <Input inputMode="numeric" value={form.stock} onChange={(e) => set('stock', e.target.value)} aria-invalid={!!errors.stock} />
            {errors.stock && <p className="mt-1 text-xs text-red-600">{errors.stock}</p>}
          </Field>
          <Field label="SKU (optional)">
            <Input
              value={form.sku}
              onChange={(e) => set('sku', e.target.value)}
              placeholder={product ? productSku(product) : 'e.g. MAT-01'}
              maxLength={64}
              aria-invalid={!!errors.sku}
            />
            {errors.sku ? (
              <p className="mt-1 text-xs text-red-600">{errors.sku}</p>
            ) : (
              <p className="mt-1 text-xs text-stone-500">Used to match rows when you import a CSV.</p>
            )}
          </Field>
          <Field label="Visibility">
            <Select
              value={form.status}
              disabled={moderated}
              onChange={(e) => set('status', e.target.value as Form['status'])}
            >
              <option value="active">Active — shown in the shop</option>
              <option value="hidden">Hidden — only you can see it</option>
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}
