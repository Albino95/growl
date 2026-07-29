import { NextResponse } from 'next/server';

type Body = { email?: string };

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() || '';
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.WAITLIST_TO?.trim() || 'hello@grow.app';
  const from = process.env.EMAIL_FROM?.trim() || 'Grow! <onboarding@resend.dev>';

  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject: 'Grow! waitlist signup',
          text: `New early access signup: ${email}`,
          html: `<p>New Grow! early access signup:</p><p><strong>${email}</strong></p>`,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        console.error('[waitlist] Resend failed', res.status, text);
        return NextResponse.json(
          { error: 'Could not join the waitlist right now. Try again later.' },
          { status: 503 }
        );
      }
    } catch (err) {
      console.error('[waitlist] Resend error', err);
      return NextResponse.json(
        { error: 'Could not join the waitlist right now. Try again later.' },
        { status: 503 }
      );
    }
  } else {
    console.log('[waitlist] signup (no RESEND_API_KEY):', email);
  }

  return NextResponse.json({
    message: 'You’re on the Grow! early access list. We’ll be in touch.',
  });
}
