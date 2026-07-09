/**
 * Request account data export or deletion (GDPR / store compliance).
 */
import { request } from './http';

export type AccountExportPayload = {
  user: Record<string, unknown>;
  posts: unknown[];
  comments: unknown[];
  orders: unknown[];
  reports: unknown[];
  exported_at: string;
};

export async function exportAccountData(): Promise<AccountExportPayload> {
  const res = await request<{ success: boolean; data: AccountExportPayload }>('/privacy/export', {
    method: 'GET',
  });
  if (!res.success || !res.data) {
    throw new Error('Failed to export account data');
  }
  return res.data;
}

export async function deleteAccount(confirm = 'DELETE'): Promise<{ ok: boolean; message: string }> {
  const res = await request<{ success: boolean; data: { ok: boolean; message: string } }>(
    '/privacy/delete-account',
    {
      method: 'POST',
      body: JSON.stringify({ confirm }),
    }
  );
  if (!res.success || !res.data?.ok) {
    throw new Error('Failed to delete account');
  }
  return res.data;
}
