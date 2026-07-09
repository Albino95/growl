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
