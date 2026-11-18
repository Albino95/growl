/**
 * Reports filed against a user can describe a specific item in details.kind (the
 * reports.target_type CHECK only allows user/post/product): journal entries, shop
 * questions and reviews. These helpers surface that to moderators.
 */
export type ReportDetails = { kind?: unknown; item_id?: unknown; excerpt?: unknown; product_id?: unknown };

const KIND_LABELS: Record<string, string> = {
  journal: 'Journal entry',
  product_question: 'Product question',
  product_review: 'Product review',
};

export function reportKind(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const kind = (details as ReportDetails).kind;
  return typeof kind === 'string' && kind ? kind : null;
}

export function reportKindLabel(details: unknown): string | null {
  const kind = reportKind(details);
  if (!kind) return null;
  return KIND_LABELS[kind] || kind.replace(/_/g, ' ');
}

export function reportExcerpt(details: unknown): string | null {
  if (!details || typeof details !== 'object') return null;
  const excerpt = (details as ReportDetails).excerpt;
  return typeof excerpt === 'string' && excerpt.trim() ? excerpt : null;
}
