import { getSecureItem, setSecureItem, deleteSecureItem } from './secureStore';

const KEY = 'pending_email_verification';

export type PendingVerification = {
  email: string;
  expiresAt: string;
  devCode?: string | null;
};

export async function savePendingVerification(pending: PendingVerification): Promise<void> {
  await setSecureItem(KEY, JSON.stringify(pending));
}

export async function loadPendingVerification(): Promise<PendingVerification | null> {
  try {
    const raw = await getSecureItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingVerification;
    if (!parsed?.email || !parsed?.expiresAt) {
      await clearPendingVerification();
      return null;
    }
    const expires = new Date(parsed.expiresAt).getTime();
    if (Number.isNaN(expires) || expires < Date.now()) {
      await clearPendingVerification();
      return null;
    }
    return {
      email: String(parsed.email).trim().toLowerCase(),
      expiresAt: parsed.expiresAt,
      devCode: parsed.devCode ?? null,
    };
  } catch {
    return null;
  }
}

export async function clearPendingVerification(): Promise<void> {
  await deleteSecureItem(KEY);
}
