import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import CATEGORIES from '../data/categories';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Human-readable label for a category path (`fitness` or `fitness:cardio`). */
export function getCategoryLabel(cat: string): string {
  const parentKey = cat.includes(':') ? cat.split(':')[0] : cat;
  const category = CATEGORIES.find((c) => c.key === parentKey);
  if (!category) return cat;
  if (!cat.includes(':')) return category.label;
  const sub = category.subcategories.find((s) => s.key === cat.split(':')[1]);
  return sub ? `${category.label} · ${sub.label}` : category.label;
}

/** Icon + split labels for a growth-area path. */
export function getCategoryMeta(cat: string): {
  parentKey: string;
  parentLabel: string;
  subLabel: string | null;
  icon: IoniconName;
} {
  const parentKey = cat.includes(':') ? cat.split(':')[0] : cat;
  const category = CATEGORIES.find((c) => c.key === parentKey);
  const subKey = cat.includes(':') ? cat.split(':')[1] : null;
  const sub = subKey
    ? category?.subcategories.find((s) => s.key === subKey)
    : undefined;

  return {
    parentKey,
    parentLabel: category?.label || parentKey,
    subLabel: sub?.label ?? null,
    icon: (category?.icon || 'leaf-outline') as IoniconName,
  };
}
