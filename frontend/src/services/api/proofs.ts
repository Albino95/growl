/**
 * Proof of progress (backend: routes/wave3/proofx.ts, migration 0044).
 * Optional — never needed for a check-in or a streak. Private by default:
 * the owner, their coach (active plan + consent) and, only when shared,
 * friends / path buddies can see a proof. Files are served only through
 * GET /proofs/:id/media with an Authorization header (see `proofMediaSource`).
 */
import { ApiError, refreshSession, request } from './http';
import { newIdempotencyKey } from './idempotency';
import {
  readAccessToken,
  uploadPrivateMediaFile,
  type PrivateUploadResult,
  type UploadControl,
} from './media';

type Envelope<T> = { success: boolean; data: T };

export type ProofKind = 'note' | 'timer' | 'number' | 'photo' | 'voice';
export type ProofContextType = 'checkin' | 'assignment' | 'weekly';
export const PROOF_KINDS: ProofKind[] = ['photo', 'timer', 'number', 'note', 'voice'];

export type Proof = {
  id: string;
  user_id: string;
  kind: ProofKind;
  text?: string | null;
  number?: number | null;
  unit?: string | null;
  minutes?: number | null;
  duration_s?: number | null;
  /** AUTH-REQUIRED url — load with `proofMediaSource` / <ProofMedia />. */
  media_url?: string | null;
  media_type?: string | null;
  /** The file was removed after its keep period (plan + 90 days / 1 year). */
  media_expired?: boolean;
  context_type: ProofContextType;
  context_id: string;
  path?: string | null;
  day?: string;
  shared_with_coach: boolean;
  shared_with_friends?: boolean;
  seen_by_coach_at?: string | null;
  cheers: number;
  cheered_by_me: boolean;
  created_at: string;
};

export type CreateProofInput = {
  kind: ProofKind;
  text?: string | null;
  number?: number | null;
  unit?: string | null;
  minutes?: number | null;
  duration_s?: number | null;
  /** Key from `uploadProofMedia` (photo / voice). */
  media_key?: string | null;
  context_type: ProofContextType;
  context_id: string;
  path?: string | null;
  share_with_coach?: boolean;
  share_with_friends?: boolean;
};

export type ListProofsParams = {
  user_id?: string;
  context_type?: ProofContextType;
  context_id?: string;
  from?: string;
  to?: string;
  limit?: number;
};

/** The server doesn't have proofs yet (old deploy) → hide the feature. */
export function isProofsUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404 && (err.code === 'NOT_FOUND' || err.code == null);
}

const proofPath = (id: string) => `/proofs/${encodeURIComponent(id)}`;

export async function createProof(
  input: CreateProofInput,
  opts?: { idempotencyKey?: string }
): Promise<{ proof: Proof; points_awarded: number }> {
  const res = await request<Envelope<{ proof: Proof; points_awarded: number }>>('/proofs', {
    method: 'POST',
    body: JSON.stringify(input),
    idempotencyKey: opts?.idempotencyKey ?? newIdempotencyKey(),
  });
  if (!res.data?.proof) throw new Error('Could not save proof');
  return { proof: res.data.proof, points_awarded: Number(res.data.points_awarded) || 0 };
}

export async function listProofs(params: ListProofsParams = {}): Promise<Proof[]> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const qs = q.toString();
  const res = await request<Envelope<{ proofs: Proof[] }>>(`/proofs${qs ? `?${qs}` : ''}`);
  return res.data?.proofs ?? [];
}

export async function getProof(id: string): Promise<Proof> {
  const res = await request<Envelope<{ proof: Proof }>>(proofPath(id));
  return res.data.proof;
}

export async function deleteProof(id: string): Promise<void> {
  await request(proofPath(id), { method: 'DELETE' });
}

export async function updateProofSharing(
  id: string,
  sharing: { share_with_coach?: boolean; share_with_friends?: boolean }
): Promise<Proof> {
  const res = await request<Envelope<{ proof: Proof }>>(proofPath(id), {
    method: 'PATCH',
    body: JSON.stringify(sharing),
  });
  return res.data.proof;
}

export async function cheerProof(id: string): Promise<{ cheers: number; cheered_by_me: boolean }> {
  const res = await request<Envelope<{ cheers: number; cheered_by_me: boolean }>>(`${proofPath(id)}/cheer`, {
    method: 'POST',
  });
  return { cheers: Number(res.data?.cheers) || 0, cheered_by_me: !!res.data?.cheered_by_me };
}

export async function markProofSeen(id: string): Promise<{ seen_by_coach_at: string }> {
  const res = await request<Envelope<{ seen_by_coach_at: string }>>(`${proofPath(id)}/seen`, {
    method: 'POST',
  });
  return res.data;
}

/** Proof upload caps (must match backend/src/routes/media.ts). */
export const MAX_PROOF_IMAGE_BYTES = 1.5 * 1024 * 1024;
export const MAX_PROOF_AUDIO_BYTES = 2 * 1024 * 1024;

/**
 * Upload a prepared proof file (photo already compressed by the sheet, or an
 * m4a voice note) → private key for `createProof({ media_key })`.
 */
export function uploadProofMedia(
  uri: string,
  kind: 'photo' | 'voice',
  control?: UploadControl
): Promise<PrivateUploadResult> {
  return uploadPrivateMediaFile(uri, 'proof', {
    mimeType: kind === 'voice' ? 'audio/m4a' : 'image/jpeg',
    fileName: kind === 'voice' ? 'voice.m4a' : 'proof.jpg',
    ...control,
  });
}

/**
 * Source for expo-image / expo-audio: the auth-required media URL with a Bearer
 * header. Pass `refresh: true` after a failed load to renew an expired token.
 */
export async function proofMediaSource(
  proof: Pick<Proof, 'media_url'>,
  opts?: { refresh?: boolean }
): Promise<{ uri: string; headers: Record<string, string> } | null> {
  if (!proof.media_url) return null;
  if (opts?.refresh) {
    try {
      await refreshSession();
    } catch {
      /* fall back to the stored token */
    }
  }
  const token = await readAccessToken();
  return { uri: proof.media_url, headers: token ? { Authorization: `Bearer ${token}` } : {} };
}
