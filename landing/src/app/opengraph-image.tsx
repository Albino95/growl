import { ImageResponse } from 'next/og';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/seo';

export const runtime = 'edge';
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
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
          background:
            'linear-gradient(155deg, #064e3b 0%, #0c1f17 48%, #022c22 100%)',
          color: '#ecfdf5',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 120,
            right: 80,
            width: 280,
            height: 280,
            borderRadius: 999,
            background: 'radial-gradient(circle, rgba(52,211,153,0.55), rgba(5,150,105,0.05))',
          }}
        />
        <div style={{ fontSize: 96, fontWeight: 800, letterSpacing: -2 }}>
          Grow<span style={{ color: '#34d399' }}>!</span>
        </div>
        <div style={{ marginTop: 16, fontSize: 36, fontWeight: 600, maxWidth: 720 }}>
          {SITE_TAGLINE}
        </div>
        <div style={{ marginTop: 20, fontSize: 22, opacity: 0.8 }}>
          Interest-based growth · Peer instructors · Curated marketplace
        </div>
      </div>
    ),
    { ...size }
  );
}
