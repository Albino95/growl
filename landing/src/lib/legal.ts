export type LegalPageId = 'privacy' | 'terms' | 'community' | 'delete-account' | 'support';

export type LegalPage = {
  id: LegalPageId;
  title: string;
  updatedAt: string;
  description: string;
  sections: Array<{ heading: string; body: string[] }>;
};

const UPDATED = '5 September 2026';

export const LEGAL_PAGES: Record<LegalPageId, LegalPage> = {
  privacy: {
    id: 'privacy',
    title: 'Privacy Policy',
    updatedAt: UPDATED,
    description:
      'How Grow! collects, uses, shares, and deletes personal data for the Grow! mobile apps and letsgrow.lu.',
    sections: [
      {
        heading: 'Who we are',
        body: [
          'Grow! (“we”, “us”) is a personal-growth social app operated from Luxembourg. For privacy requests contact privacy@letsgrow.lu.',
          'This policy applies to the Grow! iOS and Android apps (bundle / package app.growl.mobile), the website letsgrow.lu, and related APIs.',
        ],
      },
      {
        heading: 'Data we collect',
        body: [
          'Account data: email address, password hash (if you use email sign-in), username, avatar, bio, and growth-path preferences.',
          'Sign-in providers: if you use Sign in with Apple (or Google / Facebook when enabled), we receive the identifiers and profile fields those providers share with us (for example a name or email).',
          'User content: posts, reels, stories, comments, direct messages, journal entries, and reports you submit.',
          'Social graph: follows, blocks, mutes, and friend connections.',
          'Marketplace: order details, shipping information you enter at checkout, and payment status from Stripe. We do not store full card numbers on our servers.',
          'Technical and security data: app and server logs, IP address for rate limiting and abuse prevention, and crash diagnostics if Sentry is enabled on a store build.',
          'Unverified signups are kept for up to 24 hours so you can enter your email verification code, then deleted if you never verify.',
        ],
      },
      {
        heading: 'How we use data',
        body: [
          'To create and secure your account, send verification and password-reset emails, personalize feeds and the shop, process marketplace orders, provide messaging, and operate safety and moderation features.',
          'We do not sell your personal information. We do not use your content to train third-party advertising profiles. Grow! does not show third-party ads in the current app.',
        ],
      },
      {
        heading: 'User-generated content and moderation',
        body: [
          'Grow! is a social product. Content you and others post (including posts, reels, stories, comments, and messages) may be visible to other users according to product features.',
          'You can report posts and profiles, and block other users, from the in-app menus. Reports are reviewed by our team. We may remove content, warn users, suspend accounts, or permanently ban accounts that violate our Terms or Community Guidelines (https://letsgrow.lu/community).',
          'We may retain report records and limited evidence needed to investigate abuse, protect users, or comply with law, even after related content is removed.',
        ],
      },
      {
        heading: 'Processors and third parties',
        body: [
          'Cloudflare (hosting, database, object storage, CDN).',
          'Resend (transactional email such as verification and password reset).',
          'Stripe (payments when checkout is enabled).',
          'Apple, Google, or Facebook if you choose to sign in with those providers.',
          'Sentry for crash reporting only when enabled on a given build.',
        ],
      },
      {
        heading: 'Account deletion, export, and retention',
        body: [
          'You can export a copy of key account data and delete your account in the app: Profile → Settings → Delete Account. You may also follow https://letsgrow.lu/delete-account or email privacy@letsgrow.lu from your account email.',
          'When you delete your account we disable login, anonymize identifying account fields, and remove or anonymize associated profile content subject to technical processing time. Some records may be retained where required by law or for fraud, tax, payment, or abuse investigation (for example order history or moderation records).',
          'Under GDPR and similar laws you may request access, correction, export, or erasure of personal data, and object to certain processing. Email privacy@letsgrow.lu.',
        ],
      },
      {
        heading: 'Children',
        body: [
          'Grow! is not directed at children under 13. You must be at least 13 to create an account. If we learn that we collected personal data from a child under 13, we will delete the account and related personal data.',
        ],
      },
      {
        heading: 'International processing and contact',
        body: [
          'We may process data in the European Economic Area and other countries where our processors operate, with appropriate safeguards.',
          'Privacy contact: privacy@letsgrow.lu. Support: support@letsgrow.lu.',
        ],
      },
    ],
  },
  terms: {
    id: 'terms',
    title: 'Terms of Service',
    updatedAt: UPDATED,
    description: 'Rules for using the Grow! app, community features, and marketplace.',
    sections: [
      {
        heading: 'Acceptance',
        body: [
          'By creating an account or using Grow!, you agree to these Terms and our Community Guidelines. If you do not agree, do not use the service.',
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
          'You are responsible for your credentials and activity on your account. Keep your email up to date so we can reach you about security, safety, and orders.',
          'Do not share your account. We may require verification or restrict accounts that appear compromised or abusive.',
        ],
      },
      {
        heading: 'Content and license',
        body: [
          'You keep ownership of content you post. You grant Grow! a non-exclusive, worldwide license to host, store, display, and distribute that content inside the service so we can operate Grow!.',
          'Do not post unlawful, harassing, infringing, fraudulent, or sexually exploitative material. Do not spam or manipulate the platform. We may remove content and suspend or terminate accounts that break these rules or our Community Guidelines (https://letsgrow.lu/community).',
        ],
      },
      {
        heading: 'Safety tools',
        body: [
          'You can report content and profiles and block other users in the app. For help, email support@letsgrow.lu. If you are in immediate danger, contact local emergency services first.',
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
          'You may delete your account at any time via Profile → Settings → Delete Account or https://letsgrow.lu/delete-account. We may suspend or terminate accounts that violate these terms, harm other people, or abuse the platform.',
        ],
      },
      {
        heading: 'Contact',
        body: ['Questions about these terms: legal@letsgrow.lu'],
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
        body: [
          'Harassment, hate speech, threats, bullying, and targeted attacks are not allowed.',
        ],
      },
      {
        heading: 'Safe content',
        body: [
          'Do not post illegal content, sexual exploitation of minors, non-consensual intimate imagery, gratuitous violence, scams, or spam.',
          'Report anything that breaks these rules from a post or profile menu. We review reports and may remove content or restrict accounts.',
        ],
      },
      {
        heading: 'Authenticity',
        body: [
          'Do not impersonate others. One person per personal account. Business accounts must represent a real organization you are authorized to represent.',
        ],
      },
      {
        heading: 'Enforcement',
        body: [
          'Depending on severity we may remove content, warn, temporarily suspend, or permanently ban accounts. Repeat or severe harm can lead to a permanent ban without prior warning.',
          'Appeals and questions: support@letsgrow.lu.',
        ],
      },
    ],
  },
  support: {
    id: 'support',
    title: 'Help & Support',
    updatedAt: UPDATED,
    description: 'How to get help with Grow! accounts, safety, and the marketplace.',
    sections: [
      {
        heading: 'Contact us',
        body: [
          'Email support@letsgrow.lu from the address on your Grow! account when possible. Include a short description, screenshots if useful, and any order ID for shop issues.',
          'We typically reply within 2 business days (Luxembourg business days).',
        ],
      },
      {
        heading: 'Account access',
        body: [
          'Use Forgot password on the sign-in screen, or enter the verification code from your email if you just signed up. Pending unverified signups stay available for 24 hours.',
          'Sign in with Apple is available on iOS. If you lose access to your Apple ID email, contact support@letsgrow.lu with as much account detail as you can provide.',
        ],
      },
      {
        heading: 'Safety and reporting',
        body: [
          'In the app you can report posts and profiles and block other users. For follow-up, email support@letsgrow.lu.',
          'If you are in immediate danger or witnessing a crime, contact local emergency services first, then notify us.',
        ],
      },
      {
        heading: 'Privacy, export, and deletion',
        body: [
          'Privacy Policy: https://letsgrow.lu/privacy',
          'Delete your account: Profile → Settings → Delete Account, or https://letsgrow.lu/delete-account',
          'Privacy requests: privacy@letsgrow.lu',
        ],
      },
      {
        heading: 'Marketplace orders',
        body: [
          'Contact the seller first for shipping or refund questions. If you still need help, email support@letsgrow.lu with your order ID.',
        ],
      },
    ],
  },
  'delete-account': {
    id: 'delete-account',
    title: 'Delete your account',
    updatedAt: UPDATED,
    description: 'How to export your data and delete your Grow! account (App Store & Google Play).',
    sections: [
      {
        heading: 'In the app (preferred)',
        body: [
          'Open the Grow! app → Profile → Settings → Delete Account.',
          'Optional: tap Export my data first to download a copy of key account information.',
          'Type DELETE to confirm. You will be signed out and will no longer be able to sign in with that account.',
          'Apple App Store and Google Play require an in-app account deletion path. This is that method.',
        ],
      },
      {
        heading: 'If you cannot open the app',
        body: [
          'Email privacy@letsgrow.lu from the same address as your Grow! account. Ask us to delete the account. We will complete the request after verifying ownership.',
        ],
      },
      {
        heading: 'What happens after deletion',
        body: [
          'Login is disabled. Identifying account fields are anonymized. Profile content such as posts, stories, and comments is removed or anonymized as part of the deletion process.',
          'We may retain limited records where the law requires it or for fraud, tax, payment disputes, or safety investigations (for example order history or abuse reports).',
          'Deletion is processed as soon as practicable after you confirm; some cached or backup copies may take additional time to clear.',
        ],
      },
      {
        heading: 'Related links',
        body: [
          'Privacy Policy: https://letsgrow.lu/privacy',
          'Support: support@letsgrow.lu or https://letsgrow.lu/support',
        ],
      },
    ],
  },
};
