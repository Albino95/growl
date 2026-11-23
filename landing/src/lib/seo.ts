export const SITE_NAME = 'Grow!';
/** Legal entity / publisher behind the app. */
export const COMPANY_NAME = "Let's Grow Group";
/** Brand line and motto. */
export const SITE_TAGLINE = 'Let’s Grow.';
export const SITE_MOTTO = 'Making your life better, a little each day.';
export const SITE_DESCRIPTION =
  'Making your life better, a little each day. Grow! is a calm daily check-in for up to 3 growth paths: ten seconds a day, rest days that keep your streak, a private journal and friends who cheer you on. Free on iPhone, no ads.';
/** Alias of SITE_DESCRIPTION (camelCase name used in newer code). */
export const siteDescription = SITE_DESCRIPTION;

/** Live App Store listing (iPhone). Android is waitlist-only for now. */
export const APP_STORE_ID = '6809046287';
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

/** Default share image (app/opengraph-image.tsx). Pages that set their own openGraph must list it again. */
export const OG_IMAGE = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Let’s Grow. Making your life better, a little each day. Grow! by Let’s Grow Group.',
};

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
    question: 'How long does it take each day?',
    answer:
      'About ten seconds: pick your mood, choose a path, and set one small intention if you like. In the evening, one tap answers "Did it happen?"',
  },
  {
    question: 'Will it make me feel bad when I miss a day?',
    answer:
      'No. You earn a rest day for every 7 active days (up to 2 saved), and rest days keep your streak going. If you are sick, travelling or need a break, switch on a life mode and your streak pauses without using rest days. After a gap the app says "Welcome back. Your longest streak is safe."',
  },
  {
    question: 'Do I have to prove what I did?',
    answer:
      'Never. A check-in is one tap. If you want, you can add proof: a photo, a focus timer, a number, a short note or a voice note. Proof is private by default and earns a small bonus, nothing more.',
  },
  {
    question: 'Is my journal private?',
    answer:
      'Yes. Journal entries are private by default. You can share a single entry with your circle only if you choose to.',
  },
  {
    question: 'Who can see my proof and check-ins?',
    answer:
      'You, always. Your coach sees proof you attach to their homework, and your daily check-ins only if you turn check-in sharing on. Friends see a proof only when you share it with them. Proof files are never public links.',
  },
  {
    question: 'What does it cost?',
    answer:
      'Grow! is free, with no third-party ads. When you want more than a nudge, you can work with a coach on your path — someone who helps you improve faster and keeps you on track.',
  },
  {
    question: 'Is there an Android app?',
    answer:
      'Not yet. Grow! is iPhone first. Leave your email on this page and we will send you one email when the Android app is ready.',
  },
  {
    question: 'Who is behind Grow!?',
    answer:
      "Let's Grow Group, a small team in Luxembourg. You can reach us any time at support@letsgrow.lu.",
  },
  {
    question: 'Can I delete my account?',
    answer:
      'Yes, any time: in the app under Profile, Settings, Delete Account, or at letsgrow.lu/delete-account.',
  },
];

export function organizationJsonLd(siteUrl: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: COMPANY_NAME,
    email: 'support@letsgrow.lu',
    address: { '@type': 'PostalAddress', addressCountry: 'LU' },
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
    applicationSubCategory: 'Personal growth',
    operatingSystem: 'iOS',
    inLanguage: 'en',
    slogan: SITE_MOTTO,
    publisher: { '@type': 'Organization', name: COMPANY_NAME, url: siteUrl },
    sameAs: [storeUrl],
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
