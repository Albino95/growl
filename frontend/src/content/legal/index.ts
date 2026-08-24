export type LegalDocumentId = 'terms' | 'privacy' | 'community' | 'support';

export type LegalDocument = {
  id: LegalDocumentId;
  title: string;
  updatedAt: string;
  sections: Array<{ heading: string; body: string }>;
};

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    updatedAt: '2026-08-18',
    sections: [
      {
        heading: 'Acceptance',
        body:
          'By creating an account or using Grow!, you agree to these Terms of Service. If you do not agree, do not use the app.',
      },
      {
        heading: 'Eligibility',
        body:
          'You must be at least 13 years old. If you are under the age of majority where you live, you need a parent or guardian’s permission.',
      },
      {
        heading: 'Your account',
        body:
          'You are responsible for your account credentials and for activity under your account. You must provide accurate information and keep your contact details up to date.',
      },
      {
        heading: 'Community content',
        body:
          'You retain ownership of content you post. You grant Grow! a non-exclusive license to host, display, and distribute your content within the service. Do not post unlawful, harassing, or infringing material.',
      },
      {
        heading: 'Marketplace and refunds',
        body:
          'Purchases of physical goods are made from independent sellers. Grow! may facilitate payment through Stripe but is not the seller of record unless stated otherwise. Request refunds from the seller first; if you cannot resolve it, email support@letsgrow.lu with your order ID.',
      },
      {
        heading: 'Termination',
        body:
          'You may delete your account at any time from Profile settings. We may suspend or terminate accounts that violate these terms or our Community Guidelines.',
      },
      {
        heading: 'Contact',
        body: 'Questions about these terms: legal@letsgrow.lu',
      },
    ],
  },
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    updatedAt: '2026-08-18',
    sections: [
      {
        heading: 'Overview',
        body:
          'Grow! collects information you provide (email, profile, posts) and usage data needed to operate the service. We do not sell your personal information. Contact: privacy@letsgrow.lu.',
      },
      {
        heading: 'Data we collect',
        body:
          'Account data (email, username, avatar), content you create (posts, comments, stories), social graph (friends, blocks), marketplace orders, and device/log data for security and reliability. Unverified signups are kept for 24 hours, then deleted if you never confirm your email.',
      },
      {
        heading: 'How we use data',
        body:
          'To provide the feed, messaging, marketplace, authentication, safety/moderation, and customer support. We may send service-related emails (verification, security).',
      },
      {
        heading: 'Your rights',
        body:
          'You can export or delete your account from Profile → Delete Account. Deletion schedules removal of personal data subject to legal retention requirements.',
      },
      {
        heading: 'Third parties',
        body:
          'We use infrastructure providers (Cloudflare), transactional email (Resend), optional sign-in providers (Google, Facebook, Apple), and Stripe when checkout is enabled. Crash reports may go to Sentry when enabled on store builds.',
      },
      {
        heading: 'Children',
        body:
          'Grow! is not directed at children under 13. If we learn that we collected data from a child under 13, we will delete the account.',
      },
      {
        heading: 'Contact',
        body: 'Privacy requests: privacy@letsgrow.lu',
      },
    ],
  },
  community: {
    id: 'community',
    title: 'Community Guidelines',
    updatedAt: '2026-08-18',
    sections: [
      {
        heading: 'Be respectful',
        body: 'Treat others with respect. Harassment, hate speech, threats, and bullying are not allowed.',
      },
      {
        heading: 'Safe content',
        body:
          'Do not post illegal content, sexual exploitation, gratuitous violence, or spam. Report content that violates these guidelines.',
      },
      {
        heading: 'Authenticity',
        body: 'Do not impersonate others or misrepresent your identity. One person per account unless using an approved business account.',
      },
      {
        heading: 'Enforcement',
        body:
          'Violations may result in content removal, account warnings, suspension, or permanent ban. You can report users and posts from their profile or the feed menu.',
      },
    ],
  },
  support: {
    id: 'support',
    title: 'Help & Support',
    updatedAt: '2026-08-18',
    sections: [
      {
        heading: 'Get help',
        body: 'Email support@letsgrow.lu with your account email and a description of the issue. We typically respond within 2 business days.',
      },
      {
        heading: 'Account access',
        body:
          'Use Forgot password on the sign-in screen or verify your email if you recently signed up. For SSO, use the same provider you registered with.',
      },
      {
        heading: 'Safety',
        body:
          'Block or report users and posts that make you uncomfortable. For urgent safety concerns, contact local authorities and support@letsgrow.lu.',
      },
    ],
  },
};

export const LEGAL_HUB_ITEMS = [
  { id: 'terms' as const, title: 'Terms of Service', icon: 'document-text-outline' as const },
  { id: 'privacy' as const, title: 'Privacy Policy', icon: 'shield-checkmark-outline' as const },
  { id: 'community' as const, title: 'Community Guidelines', icon: 'people-outline' as const },
  { id: 'support' as const, title: 'Help & Support', icon: 'help-circle-outline' as const },
];

export const SUPPORT_EMAIL = 'support@letsgrow.lu';
export const LEGAL_WEB_BASE = 'https://letsgrow.lu';
