export const SITE_NAME = 'Grow!';
export const SITE_TAGLINE = 'Grow by scrolling with purpose.';
export const SITE_DESCRIPTION =
  'Grow! is a personal growth social platform — interest-based feeds, peer instructors, and a curated marketplace that help you improve while you scroll.';

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://letsgrow.lu';
  return raw.replace(/\/$/, '');
}

/** True when a real App Store listing URL is configured (not the generic store homepage). */
export function hasLiveAppStoreUrl(): boolean {
  const url =
    process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() || process.env.APP_STORE_URL?.trim() || '';
  if (!url) return false;
  return /\/app\/|id\d+/i.test(url);
}

/** True when a real Play Store listing URL is configured. */
export function hasLivePlayStoreUrl(): boolean {
  const url =
    process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || process.env.PLAY_STORE_URL?.trim() || '';
  if (!url) return false;
  return /details\?id=/i.test(url) && !url.includes('id=app.growl.mobile');
}

export function getAppStoreUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() ||
    process.env.APP_STORE_URL?.trim() ||
    'https://apps.apple.com/'
  );
}

export function getPlayStoreUrl(): string {
  return (
    process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() ||
    process.env.PLAY_STORE_URL?.trim() ||
    'https://play.google.com/store'
  );
}

export function organizationJsonLd(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: siteUrl,
    logo: `${siteUrl}/favicon.svg`,
    description: SITE_DESCRIPTION,
    sameAs: [],
  };
}

export function websiteJsonLd(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: siteUrl,
    description: SITE_DESCRIPTION,
  };
}

export function softwareApplicationJsonLd(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'iOS, Android',
    description: SITE_DESCRIPTION,
    url: siteUrl,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
}

export function faqJsonLd(
  items: Array<{ question: string; answer: string }>
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };
}
