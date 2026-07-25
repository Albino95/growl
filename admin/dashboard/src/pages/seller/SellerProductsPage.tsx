import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import {
  sellerRequest,
  type SellerProduct,
} from '../../services/api/sellerClient';
import CATEGORIES, { getCategoryLabel } from '../../data/categories';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Input';
import { AlertBanner } from '../../components/ui/AlertBanner';
import { ConfirmDialog } from '../../components/ui/Dialog';
import {
  DataTable,
  DataTableHead,
  DataTableHeaderCell,
  DataTableBody,
  DataTableRow,
  DataTableCell,
  EmptyState,
} from '../../components/ui/DataTable';
import { PageLoader } from '../../components/ui/Skeleton';
import { Badge } from '../../components/ui/Badge';

type FormState = {
  id?: string;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  price: string;
  stock: string;
};

const emptyForm = (): FormState => ({
  name: '',
  description: '',
  category: 'fitness',
  subcategory: '',
  price: '',
  stock: '0',
});

export function SellerProductsPage() {
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStock, setBulkStock] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [list, dash] = await Promise.all([
        sellerRequest<{ products: SellerProduct[] }>('/business/products?period=month'),
        sellerRequest<{ kpis: { low_stock_threshold?: number } }>('/business/dashboard?period=week'),
      ]);
      setProducts(list.products || []);
      setThreshold(dash.kpis?.low_stock_threshold ?? 10);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const subs = useMemo(
    () => CATEGORIES.find((c) => c.key === form.category)?.subcategories || [],
    [form.category]
  );

  const filtered = useMemo(() => {
    if (!lowOnly) return products;
    return products.filter((p) => p.stock > 0 && p.stock < threshold);
  }, [products, lowOnly, threshold]);

  function openCreate() {
    setForm(emptyForm());
    setFormOpen(true);
  }

  function openEdit(p: SellerProduct) {
    setForm({
      id: p.id,
      name: p.name,
      description: p.description || '',
      category: p.category,
      subcategory: p.subcategory || '',
      price: String(p.price),
      stock: String(p.stock),
    });
    setFormOpen(true);
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      category: form.category,
      subcategory: form.subcategory || undefined,
      price: Number(form.price),
      stock: Number(form.stock),
    };
    try {
      if (form.id) {
        await sellerRequest(`/marketplace/products/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } else {
        await sellerRequest('/marketplace/products', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await sellerRequest(`/marketplace/products/${deleteId}`, { method: 'DELETE' });
      setDeleteId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  async function applyBulkStock() {
    const stock = Number(bulkStock);
    if (!Number.isFinite(stock) || stock < 0 || selected.size === 0) return;
    setSaving(true);
    try {
      await Promise.all(
        [...selected].map((id) =>
          sellerRequest(`/marketplace/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ stock }),
          })
        )
      );
      setSelected(new Set());
      setBulkStock('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk update failed');
    } finally {
      setSaving(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Manage catalog SKUs aligned with Grow! growth paths"
        action={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add product
          </Button>
        }
      />
      {error && <AlertBanner message={error} onDismiss={() => setError('')} />}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Low stock only (&lt; {threshold})
        </label>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <Input
              className="w-28"
              type="number"
              min={0}
              placeholder="Stock"
              value={bulkStock}
              onChange={(e) => setBulkStock(e.target.value)}
            />
            <Button variant="outline" loading={saving} onClick={() => void applyBulkStock()}>
              Set stock ({selected.size})
            </Button>
          </div>
        )}
      </div>

      <Card className="!p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState title="No products yet" description="Add your first SKU to start selling." />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableHeaderCell> </DataTableHeaderCell>
              <DataTableHeaderCell>Name</DataTableHeaderCell>
              <DataTableHeaderCell>Category</DataTableHeaderCell>
              <DataTableHeaderCell>Price</DataTableHeaderCell>
              <DataTableHeaderCell>Stock</DataTableHeaderCell>
              <DataTableHeaderCell>Sold</DataTableHeaderCell>
              <DataTableHeaderCell>Actions</DataTableHeaderCell>
            </DataTableHead>
            <DataTableBody>
              {filtered.map((p) => (
                <DataTableRow key={p.id}>
                  <DataTableCell>
                    <input
                      type="checkbox"
                      checked={selected.has(p.id)}
                      onChange={() => toggleSelect(p.id)}
                    />
                  </DataTableCell>
                  <DataTableCell className="font-medium text-slate-900">{p.name}</DataTableCell>
                  <DataTableCell>
                    {getCategoryLabel(p.category)}
                    {p.subcategory ? ` · ${p.subcategory}` : ''}
                  </DataTableCell>
                  <DataTableCell>${Number(p.price).toFixed(2)}</DataTableCell>
                  <DataTableCell>
                    {p.stock === 0 ? (
                      <Badge variant="danger">Out</Badge>
                    ) : p.stock < threshold ? (
                      <Badge variant="pending">{p.stock}</Badge>
                    ) : (
                      p.stock
                    )}
                  </DataTableCell>
                  <DataTableCell>{p.units_sold ?? 0}</DataTableCell>
                  <DataTableCell>
                    <button
                      type="button"
                      className="mr-2 inline-flex rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                      onClick={() => openEdit(p)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex rounded-lg p-2 text-rose-500 hover:bg-rose-50"
                      onClick={() => setDeleteId(p.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </Card>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <Card padding="lg" className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {form.id ? 'Edit product' : 'New product'}
            </h2>
            <form onSubmit={onSave}>
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Description">
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </Field>
              <Field label="Category">
                <Select
                  value={form.category}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, category: e.target.value, subcategory: '' }))
                  }
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Subcategory">
                <Select
                  value={form.subcategory}
                  onChange={(e) => setForm((f) => ({ ...f, subcategory: e.target.value }))}
                >
                  <option value="">None</option>
                  {subs.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    required
                  />
                </Field>
                <Field label="Stock">
                  <Input
                    type="number"
                    min={0}
                    value={form.stock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                    required
                  />
                </Field>
              </div>
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" type="button" onClick={() => setFormOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={saving}>
                  Save
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete product?"
        message="This removes the SKU from your catalog. Existing orders keep historical line items."
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void onDelete()}
      />
    </div>
  );
}
