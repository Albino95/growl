import { NextResponse } from 'next/server';

/**
 * Early-access waitlist (Android / web visitors).
 * Validates, then stores the signup in the Grow! API (`POST {GROW_API_URL}/waitlist`,
 * D1 table waitlist_signups). Optionally sends a Resend notification email.
 */

const DEFAULT_API_URL = 'https://growl-backend-production.wispy-leaf-4e8b.workers.dev/api/v1';
const PLATFORMS = ['android', 'ios', 'web'] as const;
type Platform = (typeof PLATFORMS)[number];

const SUCCESS_MESSAGE = 'You’re on the list. We’ll send you one email when Grow! is ready for you.';
const UNAVAILABLE = 'Could not join the waitlist right now. Try again later.';

type Body = { email?: unknown; platform?: unknown; source?: unknown; company?: unknown };

function apiBase(): string {
  return (process.env.GROW_API_URL?.trim() || DEFAULT_API_URL).replace(/\/$/, '');
}

function isValidEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function visitorIp(request: Request): string | null {
  return (
    request.headers.get('x-real-ip')?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null
  );
}

async function notifyByEmail(email: string, platform: Platform): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY?.trim();
  if (!resendKey) return;
  const to = process.env.WAITLIST_TO?.trim() || 'hello@letsgrow.lu';
  const from = process.env.EMAIL_FROM?.trim() || 'Grow! <onboarding@resend.dev>';
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Grow! waitlist signup (${platform})`,
        text: `New early access signup (${platform}): ${email}`,
        html: `<p>New Grow! early access signup (${escapeHtml(platform)}):</p><p><strong>${escapeHtml(email)}</strong></p>`,
      }),
    });
    if (!res.ok) console.error('[waitlist] Resend failed', res.status, await res.text());
  } catch (err) {
    // The signup is already stored; a missed notification is not the visitor's problem.
    console.error('[waitlist] Resend error', err);
  }
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  // Honeypot: real visitors never see or fill `company`. Pretend success for bots.
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return NextResponse.json({ ok: true, message: SUCCESS_MESSAGE });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  // iPhone is live on the App Store, so the waitlist defaults to Android.
  const rawPlatform = body.platform ?? 'android';
  if (!(PLATFORMS as readonly unknown[]).includes(rawPlatform)) {
    return NextResponse.json({ error: 'Invalid platform.' }, { status: 400 });
  }
  const platform = rawPlatform as Platform;

  const source =
    typeof body.source === 'string' && body.source.trim()
      ? body.source.trim().slice(0, 40)
      : 'landing';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const ip = visitorIp(request);
  if (ip) headers['X-Grow-Client-IP'] = ip; // per-visitor rate limiting in the API

  let res: Response;
  try {
    res = await fetch(`${apiBase()}/waitlist`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, platform, source }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    console.error('[waitlist] API unreachable', err);
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 });
  }

  if (res.status === 429) {
    return NextResponse.json(
      { error: 'Too many signups from here. Please try again in a little while.' },
      { status: 429 }
    );
  }
  if (res.status === 400) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  if (!res.ok) {
    console.error('[waitlist] API error', res.status, await res.text().catch(() => ''));
    return NextResponse.json({ error: UNAVAILABLE }, { status: 502 });
  }

  await notifyByEmail(email, platform);

  return NextResponse.json({ ok: true, message: SUCCESS_MESSAGE });
}
