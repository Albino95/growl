import CATEGORIES from '../data/categories';

/** Human-readable label for a category path (`fitness` or `fitness:cardio`). */
export function getCategoryLabel(cat: string): string {
  const parentKey = cat.includes(':') ? cat.split(':')[0] : cat;
  const category = CATEGORIES.find((c) => c.key === parentKey);
  if (!category) return cat;
  if (!cat.includes(':')) return category.label;
  const sub = category.subcategories.find((s) => s.key === cat.split(':')[1]);
  return sub ? `${category.label} · ${sub.label}` : category.label;
}
