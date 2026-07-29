import { Env } from '../types';

async function sendResendEmail(
  env: Env,
  to: string,
  subject: string,
  html: string
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email] ${subject} (dev — no RESEND_API_KEY):`);
    console.log(`  To: ${to}`);
    console.log(`  HTML: ${html.replace(/<[^>]+>/g, ' ').slice(0, 200)}`);
    return;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'Growl <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('[email] Resend failed:', res.status, text);
    throw new Error('Failed to send email');
  }
}

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

  if (!env.RESEND_API_KEY) {
    console.log('[email] Verification (dev — no RESEND_API_KEY):');
    console.log(`  To: ${to}`);
    console.log(`  Code: ${verifyToken}`);
    console.log(`  Link: ${link}`);
    return;
  }

  await sendResendEmail(env, to, 'Confirm your Growl email', html);
}

/**
 * Send password reset code email.
 */
export async function sendPasswordResetEmail(
  env: Env,
  to: string,
  resetCode: string,
  baseUrl?: string
): Promise<void> {
  const appBase = baseUrl || env.APP_PUBLIC_URL || 'https://growl.app';
  const link = `${appBase}/reset-password?email=${encodeURIComponent(to)}&code=${encodeURIComponent(resetCode)}`;
  const deepLink = `growl://reset-password?email=${encodeURIComponent(to)}&code=${encodeURIComponent(resetCode)}`;

  const html = `
    <p>Reset your Growl password</p>
    <p>Use this code within 1 hour:</p>
    <p style="font-size:24px;font-weight:bold;letter-spacing:4px">${resetCode}</p>
    <p>Or open the app: <a href="${deepLink}">${deepLink}</a></p>
    <p>Web: <a href="${link}">${link}</a></p>
    <p>If you did not request this, you can ignore this email.</p>
  `;

  if (!env.RESEND_API_KEY) {
    console.log('[email] Password reset (dev — no RESEND_API_KEY):');
    console.log(`  To: ${to}`);
    console.log(`  Code: ${resetCode}`);
    console.log(`  Deep link: ${deepLink}`);
    return;
  }

  await sendResendEmail(env, to, 'Reset your Growl password', html);
}
