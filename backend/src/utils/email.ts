import { Env } from '../types';
import { buildBrandedEmailHtml } from './emailTemplates';

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
  const appBase = baseUrl || env.APP_PUBLIC_URL || 'https://letsgrow.lu';
  const link = `${appBase}/verify-email?email=${encodeURIComponent(to)}&token=${verifyToken}`;

  const html = buildBrandedEmailHtml({
    previewText: `Welcome to Grow! Your verification code is ${verifyToken}.`,
    headline: 'Welcome to Grow!',
    greeting: 'Hi there,',
    bodyHtml: `
      <p style="margin:0 0 12px;">Thanks for joining <strong>Grow!</strong> — a community built around real progress, shared growth paths, and meaningful connections.</p>
      <p style="margin:0;">Enter the code below in the app to verify your email and finish creating your account.</p>
    `,
    code: verifyToken,
    codeLabel: 'Verification code',
    codeHint: 'This code expires in 24 hours for your security.',
    cta: { label: 'Open Grow!', href: link },
    footerNote: 'If the button does not work, copy and paste this link into your browser: ' + link,
  });

  if (!env.RESEND_API_KEY) {
    console.log('[email] Verification (dev — no RESEND_API_KEY):');
    console.log(`  To: ${to}`);
    console.log(`  Code: ${verifyToken}`);
    console.log(`  Link: ${link}`);
    return;
  }

  await sendResendEmail(env, to, 'Welcome to Grow! — verify your email', html);
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
  const appBase = baseUrl || env.APP_PUBLIC_URL || 'https://letsgrow.lu';
  const link = `${appBase}/reset-password?email=${encodeURIComponent(to)}&code=${encodeURIComponent(resetCode)}`;
  const deepLink = `growl://reset-password?email=${encodeURIComponent(to)}&code=${encodeURIComponent(resetCode)}`;

  const html = buildBrandedEmailHtml({
    previewText: `Your Grow! password reset code is ${resetCode}.`,
    headline: 'Reset your password',
    greeting: 'Hi there,',
    bodyHtml: `
      <p style="margin:0 0 12px;">We received a request to reset the password for your Grow! account.</p>
      <p style="margin:0;">Use the code below in the app. It is valid for 1 hour.</p>
    `,
    code: resetCode,
    codeLabel: 'Reset code',
    codeHint: 'If you did not request a password reset, you can ignore this email.',
    cta: { label: 'Reset in Grow!', href: deepLink },
    footerNote: `You can also reset your password on the web: ${link}`,
  });

  if (!env.RESEND_API_KEY) {
    console.log('[email] Password reset (dev — no RESEND_API_KEY):');
    console.log(`  To: ${to}`);
    console.log(`  Code: ${resetCode}`);
    console.log(`  Deep link: ${deepLink}`);
    return;
  }

  await sendResendEmail(env, to, 'Reset your Grow! password', html);
}
