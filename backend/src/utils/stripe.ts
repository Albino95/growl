import { Env } from '../types';

export async function stripeRequest(
  env: Env,
  path: string,
  init: { method?: string; body?: Record<string, string> } = {}
): Promise<Response> {
  const key = env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new Error('STRIPE_SECRET_KEY not configured');

  const method = init.method || (init.body ? 'POST' : 'GET');
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
  };
  let body: string | undefined;
  if (init.body && method !== 'GET') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(init.body).toString();
  }

  return fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers,
    body,
  });
}

/** Verify Stripe webhook signature (v1). */
export async function verifyStripeWebhookSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  const parts = signatureHeader.split(',').map((p) => p.trim());
  const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2);
  const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const ts = parseInt(timestamp, 10);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return signatures.some((s) => s === expected);
}
