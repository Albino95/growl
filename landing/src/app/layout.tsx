import type { Metadata } from 'next';
import { Bricolage_Grotesque, Figtree } from 'next/font/google';
import './globals.css';
import {
  SITE_NAME,
  APP_STORE_ID,
  siteDescription,
  getSiteUrl,
  organizationJsonLd,
  softwareApplicationJsonLd,
  websiteJsonLd,
} from '@/lib/seo';

const display = Bricolage_Grotesque({
  subsets: ['latin'],
  variable: '--font-bricolage',
  display: 'swap',
  axes: ['opsz'],
});

const body = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
  display: 'swap',
});

const TITLE = 'Grow! — grow a little every day';

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: siteDescription,
  applicationName: SITE_NAME,
  keywords: [
    'Grow!',
    'Grow app',
    'personal growth',
    'daily check-in',
    'habit tracker',
    'streak with rest days',
    'private journal',
    'growth with friends',
  ],
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: SITE_NAME,
    title: TITLE,
    description: siteDescription,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: siteDescription,
  },
  alternates: {
    canonical: siteUrl,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  itunes: {
    appId: APP_STORE_ID,
  },
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = [organizationJsonLd(siteUrl), websiteJsonLd(siteUrl), softwareApplicationJsonLd(siteUrl)];

  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="bg-soil font-body text-bark antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-card focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-bark"
        >
          Skip to content
        </a>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
