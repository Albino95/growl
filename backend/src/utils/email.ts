import { Env } from '../types';

/**
 * Send verification email. Uses Resend when RESEND_API_KEY is set; otherwise logs in development.
 */
export async function sendVerificationEmail(
  env: Env,
  to: string,
  verifyToken: string,
  baseUrl?: string
): Promise<void> {
  const appBase = baseUrl || env.APP_PUBLIC_URL || 'https://growl.app';
  const link = `${appBase}/verify-email?email=${encodeURIComponent(to)}&token=${verifyToken}`;

  const html = `
    <p>Welcome to Growl!</p>
    <p>Confirm your email with this code (valid 24 hours):</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${verifyToken}</p>
    <p>Or open: <a href="${link}">${link}</a></p>
  `;

  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || 'Growl <onboarding@resend.dev>',
        to: [to],
        subject: 'Confirm your Growl email',
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error('[email] Resend failed:', res.status, text);
      throw new Error('Failed to send verification email');
    }
    return;
  }

  console.log('[email] Verification (dev — no RESEND_API_KEY):');
  console.log(`  To: ${to}`);
  console.log(`  Code: ${verifyToken}`);
  console.log(`  Link: ${link}`);
}
