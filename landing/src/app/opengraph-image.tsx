import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/seo';

export const runtime = 'edge';
export const alt = `${SITE_NAME} · ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          padding: 72,
          background: 'linear-gradient(155deg, #F3EEE4 0%, #EAE4D6 55%, #FFFcf7 100%)',
          color: '#1c1917',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 80,
            right: 90,
            width: 220,
            height: 220,
            borderRadius: 48,
            background: '#047857',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#F3EEE4',
            fontSize: 96,
            fontWeight: 800,
          }}
        >
          G
        </div>
        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>
          Grow<span style={{ color: '#F97066' }}>!</span>
        </div>
        <div style={{ marginTop: 16, fontSize: 36, fontWeight: 600, maxWidth: 720 }}>
          {SITE_TAGLINE}
        </div>
        <div style={{ marginTop: 20, fontSize: 22, opacity: 0.75 }}>
          Goals · Coaches · Community — skills you unlock and share
        </div>
      </div>
    ),
    { ...size }
  );
}
