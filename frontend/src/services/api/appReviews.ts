import { request } from './http';

export type AppReview = {
  id: string;
  stars: number;
  body: string;
  created_at: string;
  updated_at: string;
  author: { id: string; username: string };
  mine: boolean;
  reply: { body: string; at: string | null; from: string } | null;
  email?: string | null;
};

export type AppReviewsPayload = {
  reviews: AppReview[];
  mine: AppReview | null;
  can_reply: boolean;
  summary: { count: number; avg: number | null };
};

export async function listAppReviews(): Promise<AppReviewsPayload> {
  const res = await request<{ success: boolean; data: AppReviewsPayload }>('/app-reviews');
  if (!res.success || !res.data) throw new Error('Could not load reviews');
  return {
    reviews: res.data.reviews ?? [],
    mine: res.data.mine ?? null,
    can_reply: !!res.data.can_reply,
    summary: res.data.summary ?? { count: 0, avg: null },
  };
}

export async function upsertAppReview(input: { stars: number; body: string }): Promise<AppReview> {
  const res = await request<{ success: boolean; data: { review: AppReview } }>('/app-reviews', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  if (!res.success || !res.data?.review) throw new Error('Could not save your review');
  return res.data.review;
}

export async function replyToAppReview(id: string, body: string): Promise<AppReview> {
  const res = await request<{ success: boolean; data: { review: AppReview } }>(
    `/app-reviews/${encodeURIComponent(id)}/reply`,
    {
      method: 'POST',
      body: JSON.stringify({ body }),
    }
  );
  if (!res.success || !res.data?.review) throw new Error('Could not send reply');
  return res.data.review;
}
