import { ImageResponse } from 'next/og';
import { SITE_NAME } from '@/lib/seo';

const HEADLINE = 'Grow a little every day.';
const SUBLINE = 'Ten seconds a day. Rest days included. No ads.';
const DOMAIN = 'letsgrow.lu';

export const alt = `${SITE_NAME} — ${HEADLINE} ${SUBLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const SOIL = '#F3EEE4';
const BARK = '#1C1917';
const MOSS = '#57534E';

/**
 * Loads a Bricolage Grotesque TTF from Google Fonts, subset to the glyphs we draw.
 * Satori needs TTF/OTF (no woff2); without a browser UA the css2 API serves TTF.
 * Returns null on any failure so the image still renders with the default font.
 */
async function loadBricolage(weight: number, text: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(cssUrl)).text();
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const res = await fetch(src);
    return res.ok ? await res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

/** The seed mark (leaf over a cupped hand) from public/brand-mark.png, as vector. */
function SeedMark({ size: px }: { size: number }) {
  return (
    <svg width={px} height={px} viewBox="280 190 470 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#52D1A0" />
          <stop offset="100%" stopColor="#079A6E" />
        </linearGradient>
      </defs>
      <path
        fill="url(#leaf)"
        d="M400 545 C340 460 340 340 430 280 C500 230 570 205 610 215 C680 235 680 330 650 410 C615 510 560 580 485 605 C455 600 445 520 465 460 C480 420 505 400 535 378 C470 395 405 460 400 545 Z"
      />
      <path
        fill="url(#leaf)"
        d="M300 615 C300 595 335 590 348 620 C380 700 440 735 520 737 C580 738 625 710 642 680 C650 665 640 660 625 662 C570 670 510 665 487 640 C560 640 610 625 660 605 C690 592 728 595 725 625 C715 700 640 795 515 800 C400 805 315 720 300 640 Z"
      />
    </svg>
  );
}

export default async function OpenGraphImage() {
  const [bold, regular] = await Promise.all([
    loadBricolage(800, `${SITE_NAME}${HEADLINE}`),
    loadBricolage(500, `${SUBLINE}${DOMAIN}`),
  ]);
  const fonts = [
    ...(bold ? [{ name: 'Bricolage', data: bold, weight: 800 as const, style: 'normal' as const }] : []),
    ...(regular ? [{ name: 'Bricolage', data: regular, weight: 500 as const, style: 'normal' as const }] : []),
  ];
  const family = fonts.length ? 'Bricolage, sans-serif' : 'sans-serif';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: SOIL,
          color: BARK,
          fontFamily: family,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <SeedMark size={84} />
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 104,
              fontWeight: 800,
              letterSpacing: -3,
              lineHeight: 1.02,
              maxWidth: 760,
            }}
          >
            {HEADLINE}
          </div>
          <div style={{ marginTop: 28, fontSize: 38, fontWeight: 500, color: MOSS }}>{SUBLINE}</div>
        </div>

        <div style={{ display: 'flex', fontSize: 26, fontWeight: 500, color: '#047857' }}>{DOMAIN}</div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
