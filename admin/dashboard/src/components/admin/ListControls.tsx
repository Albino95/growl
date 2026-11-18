import { useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

/** Search box that submits on Enter / button (no request per keystroke). */
export function SearchBar({
  value,
  onSearch,
  placeholder = 'Search…',
  label = 'Search',
}: {
  value: string;
  onSearch: (q: string) => void;
  placeholder?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  function submit(e: FormEvent) {
    e.preventDefault();
    onSearch(draft.trim());
  }
  return (
    <form onSubmit={submit} className="flex w-full gap-2 sm:max-w-md" role="search">
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <Button type="submit" variant="outline" aria-label={label}>
        <Search className="h-4 w-4" aria-hidden />
      </Button>
    </form>
  );
}

/** Offset pager: "1–50 of 312" with previous/next. */
export function Pager({
  offset,
  limit,
  total,
  count,
  onChange,
}: {
  offset: number;
  limit: number;
  total: number;
  count: number;
  onChange: (offset: number) => void;
}) {
  if (total <= 0) return null;
  const from = offset + 1;
  const to = offset + count;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-stone-600">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          aria-label="Previous page"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          aria-label="Next page"
          disabled={to >= total}
          onClick={() => onChange(offset + limit)}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
