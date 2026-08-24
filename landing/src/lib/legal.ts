export type LegalPageId = 'privacy' | 'terms' | 'community' | 'delete-account' | 'support';

export type LegalPage = {
  id: LegalPageId;
  title: string;
  updatedAt: string;
  description: string;
  sections: Array<{ heading: string; body: string[] }>;
};

const UPDATED = '18 August 2026';

export const LEGAL_PAGES: Record<LegalPageId, LegalPage> = {
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    updatedAt: UPDATED,
    description: 'How Grow! collects, uses, and stores personal data.',
    sections: [
      {
        heading: 'Who we are',
        body: [
          'Grow! (“we”, “us”) is a personal-growth social app operated from Luxembourg. Contact: privacy@letsgrow.lu.',
          'This policy applies to the Grow! mobile apps, letsgrow.lu, and related APIs.',
        ],
      },
      {
        heading: 'Data we collect',
        body: [
          'Account data: email, password hash, username, avatar, bio, growth paths.',
          'Content: posts, stories, comments, messages, journal entries, and reports you submit.',
          'Social graph: follows, blocks, mutes, and friend connections.',
          'Marketplace: orders, shipping details you enter at checkout, and payment status from Stripe. We do not store full card numbers.',
          'Technical data: device/app logs, IP address for rate limiting and security, and crash reports if Sentry is enabled.',
          'Unverified signups are kept for 24 hours so you can enter your email code, then deleted if you never verify.',
        ],
      },
      {
        heading: 'How we use data',
        body: [
          'To create and secure your account, send verification and password-reset emails, personalize feeds and the shop, process orders, and moderate safety reports.',
          'We do not sell your personal information. We do not use your content to train third-party advertising profiles.',
        ],
      },
      {
        heading: 'Processors',
        body: [
          'Cloudflare (hosting, storage, CDN).',
          'Resend (transactional email).',
          'Stripe (payments when checkout is enabled).',
          'Apple, Google, or Facebook if you choose to sign in with those providers.',
        ],
      },
      {
        heading: 'Retention and your rights',
        body: [
          'You can export or delete your account in the app (Profile → Settings → Delete Account) or via https://letsgrow.lu/delete-account.',
          'Under GDPR you may access, correct, export, or erase personal data, and object to certain processing. Email privacy@letsgrow.lu.',
          'We may retain limited records after deletion where required by law (for example fraud, tax, or dispute records).',
        ],
      },
      {
        heading: 'Children',
        body: [
          'Grow! is not directed at children under 13. If we learn that we collected data from a child under 13, we will delete the account.',
        ],
      },
    ],
  },
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    updatedAt: UPDATED,
    description: 'Rules for using the Grow! app and marketplace.',
    sections: [
      {
        heading: 'Acceptance',
        body: [
          'By creating an account or using Grow!, you agree to these Terms. If you do not agree, do not use the service.',
        ],
      },
      {
        heading: 'Eligibility',
        body: [
          'You must be at least 13 years old. If you are under the age of majority where you live, you need a parent or guardian’s permission.',
        ],
      },
      {
        heading: 'Your account',
        body: [
          'You are responsible for your credentials and activity on your account. Keep your email up to date so we can reach you about security and orders.',
        ],
      },
      {
        heading: 'Content',
        body: [
          'You keep ownership of content you post. You grant Grow! a non-exclusive license to host, display, and distribute that content inside the service.',
          'Do not post unlawful, harassing, infringing, or sexually exploitative material. We may remove content and suspend accounts that break these rules or our Community Guidelines.',
        ],
      },
      {
        heading: 'Marketplace and refunds',
        body: [
          'Physical goods are sold by independent businesses. Grow! may facilitate payment through Stripe but is not the seller of record unless we say so.',
          'Request refunds from the seller first. If you cannot resolve it, email support@letsgrow.lu with your order ID. Chargebacks and fraud reviews follow Stripe and card-network rules.',
        ],
      },
      {
        heading: 'Termination',
        body: [
          'You may delete your account at any time. We may suspend or terminate accounts that violate these terms, harm other people, or abuse the platform.',
        ],
      },
      {
        heading: 'Contact',
        body: ['Questions: legal@letsgrow.lu'],
      },
    ],
  },
  community: {
    id: 'community',
    title: 'Community Guidelines',
    updatedAt: UPDATED,
    description: 'What is allowed on Grow! and how we enforce it.',
    sections: [
      {
        heading: 'Be respectful',
        body: ['Harassment, hate speech, threats, and bullying are not allowed.'],
      },
      {
        heading: 'Safe content',
        body: [
          'Do not post illegal content, sexual exploitation, gratuitous violence, or spam. Report anything that breaks these rules from a post or profile.',
        ],
      },
      {
        heading: 'Authenticity',
        body: [
          'Do not impersonate others. One person per personal account. Business accounts must represent a real organization.',
        ],
      },
      {
        heading: 'Enforcement',
        body: [
          'We may remove content, warn, suspend, or ban accounts. Repeat or severe harm can lead to a permanent ban.',
        ],
      },
    ],
  },
  support: {
    id: 'support',
    title: 'Help & Support',
    updatedAt: UPDATED,
    description: 'How to get help with Grow!',
    sections: [
      {
        heading: 'Contact',
        body: [
          'Email support@letsgrow.lu with your account email and a short description. We typically reply within 2 business days.',
        ],
      },
      {
        heading: 'Account access',
        body: [
          'Use Forgot password on the sign-in screen, or enter the verification code from your email if you just signed up. Pending signups stay available for 24 hours.',
        ],
      },
      {
        heading: 'Safety',
        body: [
          'Block or report users and posts in the app. For urgent danger, contact local authorities and then support@letsgrow.lu.',
        ],
      },
    ],
  },
  'delete-account': {
    id: 'delete-account',
    title: 'Delete your account',
    updatedAt: UPDATED,
    description: 'How to export your data and permanently delete your Grow! account.',
    sections: [
      {
        heading: 'In the app (preferred)',
        body: [
          'Open Grow! → Profile → Settings → Delete Account.',
          'You can export a copy of your data first, then type DELETE to confirm.',
          'Apple App Store and Google Play require a way to delete the account. This in-app flow is that method.',
        ],
      },
      {
        heading: 'If you cannot open the app',
        body: [
          'Email privacy@letsgrow.lu from the same address as your account. Ask us to delete the account and we will complete the request.',
        ],
      },
      {
        heading: 'What is deleted',
        body: [
          'Profile, posts, stories, comments, and login access are removed or anonymized. Some records may be kept where the law requires it (payments, abuse, or disputes).',
        ],
      },
    ],
  },
};
