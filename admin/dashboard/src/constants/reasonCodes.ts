export const MODERATION_REASON_CODES = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'hate_speech', label: 'Hate speech' },
  { value: 'spam', label: 'Spam' },
  { value: 'nudity', label: 'Nudity / sexual content' },
  { value: 'violence', label: 'Violence' },
  { value: 'impersonation', label: 'Impersonation' },
  { value: 'fraud', label: 'Fraud / scam' },
  { value: 'ip_violation', label: 'IP violation' },
  { value: 'other', label: 'Other policy violation' },
];

export const ENFORCEMENT_REASON_CODES = [
  ...MODERATION_REASON_CODES,
  { value: 'tos_repeat', label: 'Repeat ToS violation' },
  { value: 'support_restore', label: 'Support restoration' },
];
