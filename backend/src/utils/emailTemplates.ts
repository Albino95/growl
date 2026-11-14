const BRAND = {
  name: 'Grow!',
  siteUrl: 'https://letsgrow.lu',
  accent: '#059669',
  accentLight: '#ecfdf5',
  text: '#1c1917',
  muted: '#78716c',
  border: '#e7e5e4',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type BrandedEmailOptions = {
  previewText: string;
  headline: string;
  greeting?: string;
  bodyHtml: string;
  code?: string;
  codeLabel?: string;
  codeHint?: string;
  cta?: { label: string; href: string };
  footerNote?: string;
};

/** Branded transactional email shell shared by verification and password reset. */
export function buildBrandedEmailHtml(options: BrandedEmailOptions): string {
  const greeting = options.greeting ? `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${BRAND.text};">${escapeHtml(options.greeting)}</p>` : '';
  const codeBlock = options.code
    ? `
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted};">${escapeHtml(options.codeLabel || 'Your code')}</p>
      <div style="margin:0 0 12px;padding:18px 24px;border-radius:12px;background:${BRAND.accentLight};border:1px solid #a7f3d0;text-align:center;">
        <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:${BRAND.accent};font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">${escapeHtml(options.code)}</span>
      </div>
      ${options.codeHint ? `<p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(options.codeHint)}</p>` : ''}
    `
    : '';
  const cta = options.cta
    ? `
      <p style="margin:24px 0 0;text-align:center;">
        <a href="${escapeHtml(options.cta.href)}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:${BRAND.accent};color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;">${escapeHtml(options.cta.label)}</a>
      </p>
    `
    : '';
  const footerNote = options.footerNote
    ? `<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(options.footerNote)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.headline)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(options.previewText)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f4;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 12px;">
              <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.24em;text-transform:uppercase;color:${BRAND.accent};">${BRAND.name}</p>
              <h1 style="margin:12px 0 0;font-size:28px;line-height:1.25;color:${BRAND.text};">${escapeHtml(options.headline)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 32px;">
              ${greeting}
              <div style="font-size:16px;line-height:1.65;color:${BRAND.text};">${options.bodyHtml}</div>
              ${codeBlock}
              ${cta}
              ${footerNote}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 32px;background:#fafaf9;border-top:1px solid ${BRAND.border};">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">
                You're receiving this because someone signed up for ${BRAND.name} with this email address.
                If that wasn't you, you can safely ignore this message.
              </p>
              <p style="margin:10px 0 0;font-size:12px;color:${BRAND.muted};">
                <a href="${BRAND.siteUrl}" style="color:${BRAND.accent};text-decoration:none;">${BRAND.siteUrl.replace(/^https?:\/\//, '')}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
