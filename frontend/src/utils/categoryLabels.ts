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

/** Group stored paths by parent so profile shows one card per growth area. */
export function groupGrowthPaths(keys: string[]): Array<{
  parentKey: string;
  parentLabel: string;
  focusLabels: string[];
  icon: IoniconName;
}> {
  const order: string[] = [];
  const byParent = new Map<
    string,
    { parentLabel: string; focusLabels: string[]; icon: IoniconName; all: boolean }
  >();

  for (const key of keys) {
    const meta = getCategoryMeta(key);
    if (!byParent.has(meta.parentKey)) {
      order.push(meta.parentKey);
      byParent.set(meta.parentKey, {
        parentLabel: meta.parentLabel,
        focusLabels: [],
        icon: meta.icon,
        all: false,
      });
    }
    const entry = byParent.get(meta.parentKey)!;
    if (!key.includes(':')) {
      entry.all = true;
      entry.focusLabels = [];
    } else if (!entry.all && meta.subLabel && !entry.focusLabels.includes(meta.subLabel)) {
      entry.focusLabels.push(meta.subLabel);
    }
  }

  return order.map((parentKey) => {
    const entry = byParent.get(parentKey)!;
    return {
      parentKey,
      parentLabel: entry.parentLabel,
      focusLabels: entry.focusLabels,
      icon: entry.icon,
    };
  });
}
