import { useRef, useState } from 'react';
import { CheckCircle2, Download, FileUp } from 'lucide-react';
import {
  IMPORT_MAX,
  errorMessage,
  importProducts,
  type ImportReport,
} from '../../../services/api/sellerApi';
import { csvCell, csvToObjects, downloadText } from '../../../lib/sellerFormat';
import CATEGORIES from '../../../data/categories';
import { Button } from '../../../components/ui/Button';
import { InlineNotice, Modal, useToast } from '../../../components/seller/SellerUI';

export const IMPORT_COLUMNS = [
  'sku',
  'name',
  'description',
  'category',
  'subcategory',
  'price',
  'stock',
  'status',
  'image_url',
] as const;

const KNOWN = new Set<string>([...IMPORT_COLUMNS, 'product_id']);

export function downloadImportTemplate() {
  const header = IMPORT_COLUMNS.join(',');
  const example = [
    ['MAT-01', 'Cork yoga mat', 'Natural cork, 4 mm, non-slip', 'fitness', 'flexibility', '49.90', '12', 'active', ''],
    ['', 'Sketchbook A5', '', 'art', 'drawing', '9,50', '30', 'hidden', ''],
  ]
    .map((r) => r.map(csvCell).join(','))
    .join('\n');
  const notes =
    '\n# Columns: sku (optional; matches an existing product to update it), name, description, ' +
    `category (${CATEGORIES.map((c) => c.key).join(' / ')}), subcategory (optional), price in EUR, stock, ` +
    'status (active or hidden), image_url (https). Lines starting with # are ignored.';
  downloadText('grow-products-template.csv', `${header}\n${example}${notes}\n`);
}

type Stage = 'pick' | 'checked' | 'done';

export function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [unknownCols, setUnknownCols] = useState<string[]>([]);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  function reset() {
    setFileName('');
    setRows([]);
    setUnknownCols([]);
    setReport(null);
    setStage('pick');
    setProblem('');
    if (fileRef.current) fileRef.current.value = '';
  }

  function close() {
    reset();
    onClose();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    reset();
    setFileName(file.name);
    if (file.size > 2 * 1024 * 1024) {
      setProblem('That file is larger than 2 MB. Split it into smaller files.');
      return;
    }
    const text = (await file.text())
      .split(/\r?\n/)
      .filter((l) => !l.trim().startsWith('#'))
      .join('\n');
    const parsed = csvToObjects(text);
    if (!parsed.headers.includes('name') && !parsed.headers.includes('sku') && !parsed.headers.includes('product_id')) {
      setProblem('We couldn’t find a header row with name, sku or product_id. Start from the template.');
      return;
    }
    if (parsed.rows.length === 0) {
      setProblem('The file has a header but no product rows.');
      return;
    }
    if (parsed.rows.length > IMPORT_MAX) {
      setProblem(`That’s ${parsed.rows.length} rows — import up to ${IMPORT_MAX} at a time.`);
      return;
    }
    setUnknownCols(parsed.headers.filter((h) => h && !KNOWN.has(h)));
    const clean = parsed.rows.map((r) => {
      const o: Record<string, string> = {};
      for (const [k, v] of Object.entries(r)) if (KNOWN.has(k) && v !== '') o[k] = v;
      return o;
    });
    setRows(clean);
    await check(clean);
  }

  async function check(data = rows) {
    setBusy(true);
    setProblem('');
    try {
      const res = await importProducts(data, true);
      setReport(res);
      setStage('checked');
    } catch (e) {
      setProblem(errorMessage(e, 'Could not check the file'));
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    setBusy(true);
    setProblem('');
    try {
      const res = await importProducts(rows, false);
      setReport(res);
      setStage('done');
      toast(`Imported: ${res.created} added, ${res.updated} updated`);
      onImported();
    } catch (e) {
      setProblem(errorMessage(e, 'Import failed — nothing was saved'));
    } finally {
      setBusy(false);
    }
  }

  const errorsByRow = new Map<number, string[]>();
  for (const e of report?.errors || []) {
    const list = errorsByRow.get(e.row) || [];
    list.push(e.field ? `${e.field}: ${e.message}` : e.message);
    errorsByRow.set(e.row, list);
  }
  const hasErrors = (report?.errors.length || 0) > 0;
  const nothingToDo = report && report.created + report.updated === 0;

  return (
    <Modal
      open={open}
      onClose={close}
      size="xl"
      title="Import products from CSV"
      description="We check every row first. Nothing is saved until you confirm, and the whole file is saved together."
      footer={
        stage === 'done' ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {stage === 'checked' && (
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
                Choose another file
              </Button>
            )}
            <Button
              onClick={() => void commit()}
              loading={busy && stage === 'checked'}
              disabled={stage !== 'checked' || hasErrors || !!nothingToDo || busy}
            >
              {report ? `Import ${report.created + report.updated} products` : 'Import'}
            </Button>
          </>
        )
      }
    >
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label="Choose CSV file"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {stage === 'pick' && (
        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="focus-ring flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 px-6 py-10 text-center transition-colors hover:border-brand-600 hover:bg-brand-50"
          >
            <FileUp className="h-8 w-8 text-brand-600" aria-hidden />
            <span className="font-semibold text-stone-800">{busy ? 'Checking…' : 'Choose a CSV file'}</span>
            <span className="text-xs text-stone-500">Up to {IMPORT_MAX} rows · comma or semicolon separated</span>
            {fileName && <span className="text-xs text-stone-600">{fileName}</span>}
          </button>
          <div className="rounded-2xl bg-surface-page p-5 text-sm text-stone-600">
            <p className="font-semibold text-stone-800">How it works</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Rows with a <b>sku</b> that matches one of your products update it; others become new products.</li>
              <li>You can also re-import your product export — its <b>product_id</b> column updates those products.</li>
              <li>Blank cells leave existing values unchanged. New products start with stock 0 unless you set it.</li>
              <li>Prices are in euros; “12,50” and “12.50” both work.</li>
            </ul>
            <Button variant="outline" className="mt-4" onClick={downloadImportTemplate}>
              <Download className="h-4 w-4" aria-hidden /> Download template
            </Button>
          </div>
        </div>
      )}

      {problem && (
        <div className="mt-4">
          <InlineNotice tone="warn">{problem}</InlineNotice>
        </div>
      )}

      {report && stage !== 'pick' && (
        <div className="space-y-4">
          {stage === 'done' ? (
            <InlineNotice tone="success">
              <span className="inline-flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" aria-hidden /> Import complete — {report.created} added, {report.updated} updated
                {report.unchanged ? `, ${report.unchanged} unchanged` : ''}.
              </span>
            </InlineNotice>
          ) : hasErrors ? (
            <InlineNotice tone="warn">
              {errorsByRow.size} {errorsByRow.size === 1 ? 'row needs' : 'rows need'} fixing before you can import. Fix them in
              your file and choose it again — nothing has been saved.
            </InlineNotice>
          ) : (
            <InlineNotice tone="info">
              Ready: {report.created} new, {report.updated} to update
              {report.unchanged ? `, ${report.unchanged} unchanged` : ''}. Nothing is saved until you press Import.
            </InlineNotice>
          )}
          {unknownCols.length > 0 && (
            <p className="text-xs text-stone-500">Ignored columns: {unknownCols.join(', ')}</p>
          )}
          <div className="max-h-[45vh] overflow-auto rounded-xl border border-surface-border">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-surface-border text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Stock</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {report.rows.map((r) => {
                  const src = rows[r.row - 1] || {};
                  const errs = errorsByRow.get(r.row);
                  return (
                    <tr key={r.row} className={errs ? 'bg-red-50/60' : ''}>
                      <td className="px-3 py-2 tabular-nums text-stone-500">{r.row}</td>
                      <td className="px-3 py-2">
                        <ActionPill action={r.action} />
                      </td>
                      <td className="px-3 py-2 text-stone-600">{src.sku || '—'}</td>
                      <td className="max-w-[220px] truncate px-3 py-2">{src.name || r.name || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{src.price || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{src.stock || '—'}</td>
                      <td className="px-3 py-2 text-xs text-red-700">{errs?.join(' · ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ActionPill({ action }: { action: string }) {
  const map: Record<string, [string, string]> = {
    create: ['New', 'bg-emerald-100 text-emerald-800'],
    update: ['Update', 'bg-sky-100 text-sky-800'],
    unchanged: ['No change', 'bg-stone-100 text-stone-600'],
    error: ['Fix', 'bg-red-100 text-red-700'],
  };
  const [label, cls] = map[action] || [action, 'bg-stone-100 text-stone-600'];
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
