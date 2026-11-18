/**
 * Product Q&A, reviews, saved replies and away message
 * (backend: routes/wave3/bizengage.ts). Getters return null / empty on 404 so the UI
 * simply hides on servers without the feature.
 */
import { request, ApiError } from './http';
import { newIdempotencyKey } from './idempotency';

type Envelope<T> = { success: boolean; data: T };

export const QUESTION_MAX = 300;
export const ANSWER_MAX = 600;
export const REVIEW_MAX = 600;
export const SAVED_REPLIES_MAX = 20;
export const AWAY_MESSAGE_MAX = 300;

export type EngagePerson = { id: string; name: string; avatar_url: string | null };
export type EngageProductRef = { id: string; name: string; image_url: string | null };

export type ProductQuestion = {
  id: string;
  product_id: string;
  body: string;
  asker: EngagePerson;
  created_at: string;
  mine?: boolean;
  answer?: { body: string; answered_at: string | null };
  product?: EngageProductRef | null;
};

export type ProductReview = {
  id: string;
  product_id: string;
  rating: number;
  body: string;
  author: EngagePerson;
  created_at: string;
  updated_at?: string;
  verified_purchase: boolean;
  mine?: boolean;
  reply?: { body: string; replied_at: string | null };
  product?: EngageProductRef | null;
};

export type ReviewViewer = {
  can_review: boolean;
  reason: 'signed_out' | 'own_product' | 'blocked' | 'needs_purchase' | null;
  my_review_id: string | null;
};

export type ProductReviews = {
  average: number;
  count: number;
  reviews: ProductReview[];
  viewer: ReviewViewer;
};

export type SavedReply = { id: string; title: string; body: string };
export type AwaySchedule = { days: number[]; from: string; to: string };
export type InboxSettings = {
  saved_replies: SavedReply[];
  away: { enabled: boolean; message: string; schedule: AwaySchedule | null };
};

export type EngageSummary = { unanswered_questions: number; unreplied_reviews: number };

function is404(e: unknown) {
  return e instanceof ApiError && e.status === 404;
}

const enc = encodeURIComponent;

// ---- Public / customer ----------------------------------------------------

/** null when the feature isn't on the server (or the product is gone). */
export async function getProductQuestions(productId: string): Promise<ProductQuestion[] | null> {
  try {
    const res = await request<Envelope<{ questions: ProductQuestion[] }>>(`/products/${enc(productId)}/questions`);
    return Array.isArray(res.data?.questions) ? res.data.questions : [];
  } catch (e) {
    if (is404(e)) return null;
    throw e;
  }
}

export async function askProductQuestion(
  productId: string,
  body: string,
  idempotencyKey: string = newIdempotencyKey()
): Promise<ProductQuestion> {
  const res = await request<Envelope<{ question: ProductQuestion }>>(`/products/${enc(productId)}/questions`, {
    method: 'POST',
    body: JSON.stringify({ body }),
    idempotencyKey,
  });
  if (!res.data?.question) throw new Error('Could not send your question');
  return res.data.question;
}

export async function getProductReviews(productId: string): Promise<ProductReviews | null> {
  try {
    const res = await request<Envelope<ProductReviews>>(`/products/${enc(productId)}/reviews`);
    const d = res.data;
    if (!d) return null;
    return {
      average: Number(d.average) || 0,
      count: Number(d.count) || 0,
      reviews: Array.isArray(d.reviews) ? d.reviews : [],
      viewer: d.viewer ?? { can_review: false, reason: null, my_review_id: null },
    };
  } catch (e) {
    if (is404(e)) return null;
    throw e;
  }
}

export async function writeProductReview(
  productId: string,
  input: { rating: number; body: string },
  idempotencyKey: string = newIdempotencyKey()
): Promise<ProductReview> {
  const res = await request<Envelope<{ review: ProductReview }>>(`/products/${enc(productId)}/reviews`, {
    method: 'POST',
    body: JSON.stringify(input),
    idempotencyKey,
  });
  if (!res.data?.review) throw new Error('Could not save your review');
  return res.data.review;
}

export async function reportProductQuestion(id: string, reason: string): Promise<void> {
  await request(`/product-questions/${enc(id)}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export async function reportProductReview(id: string, reason: string): Promise<void> {
  await request(`/product-reviews/${enc(id)}/report`, { method: 'POST', body: JSON.stringify({ reason }) });
}

// ---- Business ---------------------------------------------------------------

export async function listBusinessQuestions(status: 'unanswered' | 'all' = 'unanswered'): Promise<ProductQuestion[]> {
  try {
    const res = await request<Envelope<{ questions: ProductQuestion[] }>>(`/business/questions?status=${status}`);
    return res.data?.questions ?? [];
  } catch (e) {
    if (is404(e)) return [];
    throw e;
  }
}

export async function answerQuestion(questionId: string, body: string): Promise<ProductQuestion> {
  const res = await request<Envelope<{ question: ProductQuestion }>>(`/business/questions/${enc(questionId)}/answer`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  if (!res.data?.question) throw new Error('Could not save your answer');
  return res.data.question;
}

export async function hideQuestion(questionId: string): Promise<void> {
  await request(`/business/questions/${enc(questionId)}`, { method: 'DELETE' });
}

export async function listBusinessReviews(status: 'unreplied' | 'all' = 'unreplied'): Promise<ProductReview[]> {
  try {
    const res = await request<Envelope<{ reviews: ProductReview[] }>>(`/business/reviews?status=${status}`);
    return res.data?.reviews ?? [];
  } catch (e) {
    if (is404(e)) return [];
    throw e;
  }
}

export async function replyToReview(reviewId: string, body: string): Promise<ProductReview> {
  const res = await request<Envelope<{ review: ProductReview }>>(`/business/reviews/${enc(reviewId)}/reply`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  if (!res.data?.review) throw new Error('Could not save your reply');
  return res.data.review;
}

export async function getEngageSummary(): Promise<EngageSummary | null> {
  try {
    const res = await request<Envelope<EngageSummary>>('/business/engage/summary');
    return res.data ?? null;
  } catch (e) {
    if (is404(e)) return null;
    throw e;
  }
}

/** null on servers without the feature. */
export async function getInboxSettings(): Promise<InboxSettings | null> {
  try {
    const res = await request<Envelope<InboxSettings>>('/business/inbox-settings');
    return res.data ?? null;
  } catch (e) {
    if (is404(e)) return null;
    throw e;
  }
}

export async function saveInboxSettings(input: Partial<{
  saved_replies: Array<{ id?: string; title: string; body: string }>;
  away: { enabled: boolean; message: string; schedule?: AwaySchedule | null };
}>): Promise<InboxSettings> {
  const res = await request<Envelope<InboxSettings>>('/business/inbox-settings', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  if (!res.data) throw new Error('Could not save inbox settings');
  return res.data;
}
