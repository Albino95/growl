export const SITE_NAME = 'Grow!';
/** Legal entity / publisher behind the app. */
export const COMPANY_NAME = "Let's Grow Group";
/** Brand line and motto. */
export const SITE_TAGLINE = 'Let’s grow.';
export const SITE_MOTTO = 'Making your life better, a little each day.';
export const SITE_DESCRIPTION =
  'Making your life better, a little each day. Grow! is a calm daily check-in: up to 3 growth paths, ten seconds a day, rest days, and friends who cheer you on. Free, no ads.';
/** Alias of SITE_DESCRIPTION (camelCase name used in newer code). */
export const siteDescription = SITE_DESCRIPTION;

/** Live App Store listing (iPhone). Android is waitlist-only for now. */
export const APP_STORE_ID = '6809046287';
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/** Square PNG in /public used as the Organization logo in JSON-LD. */
export const LOGO_PATH = '/app-icon.png';

/** Real public profiles only; leave empty until they exist (omitted from JSON-LD when empty). */
export const SAME_AS: string[] = [];

export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://letsgrow.lu';
  return raw.replace(/\/$/, '');
}

/** App Store link: env override (NEXT_PUBLIC_APP_STORE_URL / APP_STORE_URL) or the live listing. */
export function getAppStoreUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() ||
    process.env.APP_STORE_URL?.trim() ||
    APP_STORE_URL
  );
}

/** True when the App Store URL points at a real listing (always true with the default). */
export function hasLiveAppStoreUrl(): boolean {
  return /\/app\/|id\d+/i.test(getAppStoreUrl());
}

/** True when a real Play Store listing URL is configured. */
export function hasLivePlayStoreUrl(): boolean {
  const url =
    process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || process.env.PLAY_STORE_URL?.trim() || '';
  if (!url) return false;
  return /details\?id=/i.test(url) && !url.includes('id=app.growl.mobile');
}

export function getPlayStoreUrl(): string {
  return (
    process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() ||
    process.env.PLAY_STORE_URL?.trim() ||
    'https://play.google.com/store'
  );
}

export type FaqItem = { question: string; answer: string };

/**
 * Honest FAQ (docs/LANDING_DESIGN.md). Only claims verified in the app.
 * The home page should render these same items so the FAQPage JSON-LD matches the
 * visible text.
 */
export const faqItems: FaqItem[] = [
  {
    question: 'Another social app?',
    answer:
      'Not the endless-feed kind. Grow! is a daily check-in for up to 3 things you want to get better at. You share progress with friends you choose, and there is no infinite scroll to get lost in.',
  },
  {
    question: 'Will it make me feel bad when I miss a day?',
    answer:
      'No. You earn a rest day for every 7 active days (up to 2 saved), and rest days keep your streak going. After a break the app says "Welcome back. Your longest streak is safe."',
  },
  {
    question: 'Is my journal private?',
    answer:
      'Yes. Journal entries are private by default. You can share a single entry with your circle only if you choose to.',
  },
  {
    question: 'What does it cost?',
    answer: 'Grow! is free, with no third-party ads.',
  },
  {
    question: 'Is there an Android app?',
    answer:
      'Not yet — Grow! is iPhone first. Leave your email on this page and we will send you one email when the Android app is ready.',
  },
  {
    question: 'Who is behind Grow!?',
    answer:
      'A small team in Luxembourg. You can reach us any time at support@letsgrow.lu.',
  },
  {
    question: 'How long does it take each day?',
    answer:
      'About ten seconds: pick your mood, choose a path, and set one small intention for the day.',
  },
  {
    question: 'Can I delete my account?',
    answer:
      'Yes, any time — in the app or at letsgrow.lu/delete-account.',
  },
];

export function organizationJsonLd(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: COMPANY_NAME,
    brand: { '@type': 'Brand', name: SITE_NAME, slogan: SITE_MOTTO },
    url: siteUrl,
    logo: `${siteUrl}${LOGO_PATH}`,
    description: SITE_DESCRIPTION,
    ...(SAME_AS.length > 0 ? { sameAs: SAME_AS } : {}),
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
  const storeUrl = getAppStoreUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'iOS',
    publisher: { '@type': 'Organization', name: COMPANY_NAME },
    description: SITE_DESCRIPTION,
    url: siteUrl,
    image: `${siteUrl}${LOGO_PATH}`,
    downloadUrl: storeUrl,
    installUrl: storeUrl,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'EUR',
    },
  };
}

/** FAQPage JSON-LD; defaults to `faqItems` so markup and structured data stay in sync. */
export function faqJsonLd(items: ReadonlyArray<FaqItem> = faqItems) {
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
