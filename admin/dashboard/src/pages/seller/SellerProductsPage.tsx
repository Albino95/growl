import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Download, Eye, EyeOff, FileUp, Package, Pencil, Plus, Trash2, X } from 'lucide-react';
import {
  BULK_MAX,
  bulkUpdateProducts,
  deleteProduct,
  duplicateProduct,
  errorMessage,
  listProducts,
  productImages,
  productSku,
  productStatus,
  type BulkItem,
  type CatalogProduct,
} from '../../services/api/sellerApi';
import { sellerDownloadCsv, sellerRequest } from '../../services/api/sellerClient';
import CATEGORIES, { getCategoryLabel } from '../../data/categories';
import { formatEur, parseLocaleNumber } from '../../lib/sellerFormat';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { ConfirmDialog } from '../../components/ui/Dialog';
import {
  EmptyBlock,
  ErrorBlock,
  IconButton,
  LoadingBlock,
  PAGE_SIZE,
  Pagination,
  SearchField,
  useToast,
} from '../../components/seller/SellerUI';
import { ProductEditor } from './products/ProductEditor';
import { ImportDialog, downloadImportTemplate } from './products/ImportDialog';

type StatusFilter = 'all' | 'active' | 'hidden' | 'low' | 'out';
type SortKey = 'newest' | 'name' | 'price_asc' | 'price_desc' | 'stock_asc' | 'best';

const SORTS: Array<{ value: SortKey; label: string }> = [
  { value: 'newest', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'stock_asc', label: 'Stock: lowest first' },
  { value: 'best', label: 'Best selling (30 days)' },
];

type BulkField = 'price' | 'stock' | 'category' | 'status';

export function SellerProductsPage() {
  const toast = useToast();
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [threshold, setThreshold] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CatalogProduct | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [bulkField, setBulkField] = useState<BulkField>('stock');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const [list, settings] = await Promise.all([
        listProducts(),
        sellerRequest<{ analytics_prefs?: { low_stock_threshold?: number } }>('/business/settings').catch(() => null),
      ]);
      setProducts(list);
      setThreshold(Number(settings?.analytics_prefs?.low_stock_threshold) || 10);
      setSelected((prev) => new Set([...prev].filter((id) => list.some((p) => p.id === id))));
    } catch (e) {
      setError(errorMessage(e, 'Failed to load products'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = products.filter((p) => {
      const st = productStatus(p);
      if (status === 'active' && st !== 'active') return false;
      if (status === 'hidden' && st === 'active') return false;
      if (status === 'low' && !(p.stock > 0 && p.stock < threshold)) return false;
      if (status === 'out' && p.stock !== 0) return false;
      if (category && p.category !== category) return false;
      if (!q) return true;
      return [p.name, p.description || '', productSku(p), getCategoryLabel(p.category)].join(' ').toLowerCase().includes(q);
    });
    const by: Record<SortKey, (a: CatalogProduct, b: CatalogProduct) => number> = {
      newest: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      name: (a, b) => a.name.localeCompare(b.name),
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
      stock_asc: (a, b) => a.stock - b.stock,
      best: (a, b) => (b.units_sold || 0) - (a.units_sold || 0),
    };
    return [...list].sort(by[sort]);
  }, [products, query, status, category, sort, threshold]);

  useEffect(() => setPage(1), [query, status, category, sort]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((p) => selected.has(p.id));

  const counts = useMemo(
    () => ({
      all: products.length,
      active: products.filter((p) => productStatus(p) === 'active').length,
      hidden: products.filter((p) => productStatus(p) !== 'active').length,
      low: products.filter((p) => p.stock > 0 && p.stock < threshold).length,
      out: products.filter((p) => p.stock === 0).length,
    }),
    [products, threshold]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((p) => next.delete(p.id));
      else pageRows.forEach((p) => next.add(p.id));
      return next;
    });
  }

  async function onDuplicate(p: CatalogProduct) {
    setBusyId(p.id);
    try {
      await duplicateProduct(p.id);
      toast(`Copied “${p.name}” — stock starts at 0`);
      await load(true);
    } catch (e) {
      toast(errorMessage(e, 'Could not duplicate'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onToggleVisibility(p: CatalogProduct) {
    const next = productStatus(p) === 'active' ? 'hidden' : 'active';
    setBusyId(p.id);
    try {
      await bulkUpdateProducts([{ id: p.id, status: next }]);
      toast(next === 'hidden' ? 'Hidden from the shop' : 'Back in the shop');
      await load(true);
    } catch (e) {
      toast(errorMessage(e, 'Could not change visibility'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      const res = await deleteProduct(deleteTarget.id);
      toast(res?.archived ? 'Removed — kept in past orders' : 'Product deleted');
      setDeleteTarget(null);
      await load(true);
    } catch (e) {
      toast(errorMessage(e, 'Delete failed'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  function bulkItems(): BulkItem[] | string {
    const ids = [...selected];
    if (bulkField === 'price') {
      const n = parseLocaleNumber(bulkValue);
      if (n === null || n <= 0) return 'Enter a price above €0';
      return ids.map((id) => ({ id, price: Math.round(n * 100) / 100 }));
    }
    if (bulkField === 'stock') {
      const n = parseLocaleNumber(bulkValue);
      if (n === null || n < 0 || !Number.isInteger(n)) return 'Stock must be a whole number';
      return ids.map((id) => ({ id, stock: n }));
    }
    if (bulkField === 'category') {
      if (!bulkValue) return 'Pick a growth path';
      return ids.map((id) => ({ id, category: bulkValue }));
    }
    if (bulkValue !== 'active' && bulkValue !== 'hidden') return 'Pick a visibility';
    const moderated = ids.filter((id) => {
      const p = products.find((x) => x.id === id);
      return p && productStatus(p) === 'moderated';
    });
    if (moderated.length) return `${moderated.length} selected product(s) were hidden by Grow! review — unselect them first`;
    return ids.map((id) => ({ id, status: bulkValue as 'active' | 'hidden' }));
  }

  function askBulk() {
    const items = bulkItems();
    if (typeof items === 'string') {
      toast(items, 'error');
      return;
    }
    setBulkConfirm(true);
  }

  async function applyBulk() {
    const items = bulkItems();
    if (typeof items === 'string') return;
    setBulkBusy(true);
    let done = 0;
    try {
      // The API saves up to 50 products per request, all-or-nothing.
      for (let i = 0; i < items.length; i += BULK_MAX) {
        const chunk = items.slice(i, i + BULK_MAX);
        await bulkUpdateProducts(chunk);
        done += chunk.length;
      }
      toast(`Updated ${done} ${done === 1 ? 'product' : 'products'}`);
      setSelected(new Set());
      setBulkValue('');
    } catch (e) {
      toast(
        done > 0
          ? `Updated ${done} of ${items.length}, then stopped: ${errorMessage(e)}`
          : errorMessage(e, 'Bulk update failed — nothing changed'),
        'error'
      );
    } finally {
      setBulkBusy(false);
      setBulkConfirm(false);
      await load(true);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await sellerDownloadCsv('/business/export/products', 'products.csv');
    } catch (e) {
      toast(errorMessage(e, 'Export failed'), 'error');
    } finally {
      setExporting(false);
    }
  }

  const bulkLabel = (() => {
    if (bulkField === 'price') return `set the price to ${formatEur(parseLocaleNumber(bulkValue) || 0)}`;
    if (bulkField === 'stock') return `set stock to ${bulkValue}`;
    if (bulkField === 'category') return `move to ${getCategoryLabel(bulkValue)}`;
    return bulkValue === 'hidden' ? 'hide from the shop' : 'show in the shop';
  })();

  return (
    <div>
      <PageHeader
        title="Products"
        subtitle="Your catalog in the Grow! shop. Photos, prices and stock stay in sync with the app."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <FileUp className="h-4 w-4" aria-hidden /> Import CSV
            </Button>
            <Button variant="outline" loading={exporting} onClick={() => void exportCsv()}>
              <Download className="h-4 w-4" aria-hidden /> Export
            </Button>
            <Button
              onClick={() => {
                setEditing(null);
                setEditorOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden /> Add product
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchField value={query} onChange={setQuery} placeholder="Search name, SKU, path…" label="Search products" />
        <Select aria-label="Filter by status" className="!w-auto" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="all">All ({counts.all})</option>
          <option value="active">Active ({counts.active})</option>
          <option value="hidden">Hidden ({counts.hidden})</option>
          <option value="low">Low stock ({counts.low})</option>
          <option value="out">Sold out ({counts.out})</option>
        </Select>
        <Select aria-label="Filter by growth path" className="!w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All paths</option>
          {CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Sort products" className="!w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk edit"
          className="sticky top-16 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-4 py-3 md:top-2"
        >
          <span className="text-sm font-semibold text-brand-700">{selected.size} selected</span>
          <Select
            aria-label="Field to change"
            className="!w-auto"
            value={bulkField}
            onChange={(e) => {
              setBulkField(e.target.value as BulkField);
              setBulkValue('');
            }}
          >
            <option value="stock">Set stock</option>
            <option value="price">Set price</option>
            <option value="category">Move to path</option>
            <option value="status">Change visibility</option>
          </Select>
          {bulkField === 'category' ? (
            <Select aria-label="New growth path" className="!w-auto" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
              <option value="">Choose…</option>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          ) : bulkField === 'status' ? (
            <Select aria-label="New visibility" className="!w-auto" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
              <option value="">Choose…</option>
              <option value="active">Active</option>
              <option value="hidden">Hidden</option>
            </Select>
          ) : (
            <Input
              aria-label={bulkField === 'price' ? 'New price in euros' : 'New stock'}
              className="!w-32"
              inputMode={bulkField === 'price' ? 'decimal' : 'numeric'}
              placeholder={bulkField === 'price' ? '€' : 'Qty'}
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
            />
          )}
          <Button onClick={askBulk} disabled={!bulkValue}>
            Apply
          </Button>
          <button
            type="button"
            className="focus-ring ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-brand-700 hover:bg-white"
            onClick={() => setSelected(new Set())}
          >
            <X className="h-4 w-4" aria-hidden /> Clear selection
          </button>
        </div>
      )}

      <Card className="overflow-hidden !p-0">
        {loading ? (
          <LoadingBlock rows={6} />
        ) : error ? (
          <ErrorBlock message={error} onRetry={() => void load()} />
        ) : products.length === 0 ? (
          <EmptyBlock
            icon={Package}
            title="Add your first product"
            description="Products with clear photos get saved more. You can add them one by one or import a CSV."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  onClick={() => {
                    setEditing(null);
                    setEditorOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" aria-hidden /> Add product
                </Button>
                <Button variant="outline" onClick={downloadImportTemplate}>
                  <Download className="h-4 w-4" aria-hidden /> CSV template
                </Button>
              </div>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyBlock title="No products match" description="Try a different search or filter." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-surface-border text-xs font-semibold uppercase tracking-wide text-stone-500">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={allOnPageSelected}
                        onChange={togglePage}
                        className="h-4 w-4 accent-emerald-600"
                      />
                    </th>
                    <th className="px-2 py-3">Product</th>
                    <th className="hidden px-4 py-3 md:table-cell">Path</th>
                    <th className="px-4 py-3 text-right">Price</th>
                    <th className="px-4 py-3 text-right">Stock</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Status</th>
                    <th className="hidden px-4 py-3 text-right lg:table-cell">Sold (30d)</th>
                    <th className="px-4 py-3 text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border">
                  {pageRows.map((p) => {
                    const st = productStatus(p);
                    const cover = productImages(p)[0];
                    return (
                      <tr key={p.id} className={`transition-colors hover:bg-surface-page/80 ${selected.has(p.id) ? 'bg-brand-50/50' : ''}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${p.name}`}
                            checked={selected.has(p.id)}
                            onChange={() => toggle(p.id)}
                            className="h-4 w-4 accent-emerald-600"
                          />
                        </td>
                        <td className="px-2 py-3">
                          <div className="flex items-center gap-3">
                            {cover ? (
                              <img src={cover} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover ring-1 ring-surface-border" />
                            ) : (
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-muted" aria-hidden>
                                <Package className="h-4 w-4 text-stone-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <button
                                type="button"
                                className="focus-ring block max-w-[260px] truncate rounded text-left font-medium text-stone-900 hover:text-brand-700"
                                onClick={() => {
                                  setEditing(p);
                                  setEditorOpen(true);
                                }}
                              >
                                {p.name}
                              </button>
                              <p className="text-xs text-stone-500">{productSku(p)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 text-stone-600 md:table-cell">{getCategoryLabel(p.category)}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatEur(p.price)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {p.stock === 0 ? (
                            <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Sold out</span>
                          ) : p.stock < threshold ? (
                            <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">{p.stock} left</span>
                          ) : (
                            p.stock
                          )}
                        </td>
                        <td className="hidden px-4 py-3 sm:table-cell">
                          {st === 'active' ? (
                            <span className="text-xs font-medium text-emerald-700">Active</span>
                          ) : st === 'hidden' ? (
                            <span className="text-xs font-medium text-stone-500">Hidden</span>
                          ) : (
                            <span className="text-xs font-medium text-red-600" title="Hidden by Grow! review">
                              Under review
                            </span>
                          )}
                        </td>
                        <td className="hidden px-4 py-3 text-right tabular-nums text-stone-600 lg:table-cell">{p.units_sold ?? 0}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <IconButton
                            label={`Edit ${p.name}`}
                            icon={Pencil}
                            onClick={() => {
                              setEditing(p);
                              setEditorOpen(true);
                            }}
                          />
                          {st !== 'moderated' && (
                            <IconButton
                              label={st === 'active' ? `Hide ${p.name}` : `Show ${p.name}`}
                              icon={st === 'active' ? EyeOff : Eye}
                              busy={busyId === p.id}
                              onClick={() => void onToggleVisibility(p)}
                            />
                          )}
                          <IconButton label={`Duplicate ${p.name}`} icon={Copy} disabled={busyId === p.id} onClick={() => void onDuplicate(p)} />
                          <IconButton label={`Delete ${p.name}`} icon={Trash2} tone="danger" onClick={() => setDeleteTarget(p)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={filtered.length} onChange={setPage} />
          </>
        )}
      </Card>

      <ProductEditor open={editorOpen} product={editing} onClose={() => setEditorOpen(false)} onSaved={() => void load(true)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImported={() => void load(true)} />

      <ConfirmDialog
        open={!!deleteTarget}
        title={`Delete “${deleteTarget?.name ?? ''}”?`}
        message="It disappears from your shop. Products that were ordered before stay in those orders’ history."
        confirmLabel="Delete"
        variant="danger"
        loading={!!deleteTarget && busyId === deleteTarget.id}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void onDelete()}
      />
      <ConfirmDialog
        open={bulkConfirm}
        title={`Update ${selected.size} ${selected.size === 1 ? 'product' : 'products'}?`}
        message={`This will ${bulkLabel} for every selected product.${selected.size > BULK_MAX ? ` We save them in groups of ${BULK_MAX}.` : ''}`}
        confirmLabel="Update"
        loading={bulkBusy}
        onCancel={() => setBulkConfirm(false)}
        onConfirm={() => void applyBulk()}
      />
    </div>
  );
}
