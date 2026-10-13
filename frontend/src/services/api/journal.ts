/**
 * Journal API service
 */

import { request } from './http';

export type JournalMood =
  | 'happy'
  | 'excited'
  | 'calm'
  | 'sad'
  | 'anxious'
  | 'grateful'
  | 'proud'
  | 'tired'
  | 'motivated'
  | 'peaceful'
  | 'determined';

export interface JournalEntry {
  id: string;
  user_id: string;
  title?: string | null;
  content: string;
  mood?: JournalMood | null;
  tags: string[];
  is_public: boolean;
  isPublic: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface JournalEntriesResponse {
  success: boolean;
  data: {
    entries: JournalEntry[];
    total: number;
    limit: number;
    offset: number;
  };
}

export interface JournalEntryResponse {
  success: boolean;
  data: JournalEntry;
}

export interface CreateJournalEntryRequest {
  title?: string;
  content: string;
  mood?: JournalMood;
  tags?: string[];
  is_public?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UpdateJournalEntryRequest {
  title?: string | null;
  content?: string;
  mood?: JournalMood | null;
  tags?: string[];
  is_public?: boolean;
  metadata?: Record<string, unknown>;
}

export async function getJournalEntries(params?: {
  scope?: 'mine' | 'public';
  visibility?: 'public' | 'private';
  limit?: number;
  offset?: number;
}): Promise<JournalEntriesResponse> {
  const query = new URLSearchParams();
  if (params?.scope) query.append('scope', params.scope);
  if (params?.visibility) query.append('visibility', params.visibility);
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.offset) query.append('offset', String(params.offset));
  const qs = query.toString();
  return request<JournalEntriesResponse>(`/journal/entries${qs ? `?${qs}` : ''}`);
}

export async function getUserPublicJournalEntries(
  userId: string,
  params?: { limit?: number; offset?: number }
): Promise<JournalEntriesResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.offset) query.append('offset', String(params.offset));
  const qs = query.toString();
  return request<JournalEntriesResponse>(
    `/journal/entries/user/${encodeURIComponent(userId)}${qs ? `?${qs}` : ''}`
  );
}

export async function createJournalEntry(
  payload: CreateJournalEntryRequest
): Promise<JournalEntryResponse> {
  return request<JournalEntryResponse>('/journal/entries', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateJournalEntry(
  entryId: string,
  payload: UpdateJournalEntryRequest
): Promise<JournalEntryResponse> {
  return request<JournalEntryResponse>(`/journal/entries/${encodeURIComponent(entryId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteJournalEntry(
  entryId: string
): Promise<{ success: boolean; data: { ok: boolean; id: string } }> {
  return request<{ success: boolean; data: { ok: boolean; id: string } }>(
    `/journal/entries/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' }
  );
}

export type CircleJournalEntry = JournalEntry & {
  username: string;
  avatar?: string | null;
  feltThis?: boolean;
  allowMessages?: boolean;
};

export async function getCircleJournalEntries(params?: {
  limit?: number;
}): Promise<{ success: boolean; data: { entries: CircleJournalEntry[]; total: number } }> {
  const query = new URLSearchParams();
  if (params?.limit) query.append('limit', String(params.limit));
  const qs = query.toString();
  return request(`/journal/circle${qs ? `?${qs}` : ''}`);
}

export async function feelJournalEntry(
  entryId: string
): Promise<{ success: boolean; data: { ok: boolean; feltThis: boolean } }> {
  return request(`/journal/entries/${encodeURIComponent(entryId)}/feel`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function muteJournalAuthor(
  userId: string,
  muted = true
): Promise<{ success: boolean; data: { ok: boolean; muted: boolean } }> {
  return request('/journal/mute', {
    method: 'POST',
    body: JSON.stringify({ userId, muted }),
  });
}

export type JournalReply = {
  id: string;
  entry_id: string;
  user_id: string;
  quote_text: string;
  body: string;
  visibility: 'public' | 'private';
  created_at: string;
  username?: string;
  avatar?: string | null;
};

export async function listJournalReplies(
  entryId: string
): Promise<{ success: boolean; data: { replies: JournalReply[]; total: number } }> {
  return request(`/journal/entries/${encodeURIComponent(entryId)}/replies`);
}

export async function createJournalReply(
  entryId: string,
  payload: { quote_text: string; body: string; visibility?: 'public' | 'private' }
): Promise<{ success: boolean; data: JournalReply }> {
  return request(`/journal/entries/${encodeURIComponent(entryId)}/replies`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type JournalReflection = {
  id: string;
  entry_id: string;
  user_id: string;
  username?: string;
  avatar?: string | null;
  quote_text: string;
  body: string;
  created_at: string;
  entry_excerpt: string;
  entry_created_at: string;
};

export async function getJournalReflections(params?: {
  limit?: number;
}): Promise<{ success: boolean; data: { reflections: JournalReflection[]; total: number } }> {
  const query = new URLSearchParams();
  if (params?.limit) query.append('limit', String(params.limit));
  const qs = query.toString();
  return request(`/journal/reflections${qs ? `?${qs}` : ''}`);
}
