/** Seeded via backend/scripts/seed-demo-core-accounts.sql — password: GrowlDemo123! */
export const DEMO_ACCOUNT_PASSWORD = 'GrowlDemo123!';

export const DEMO_ACCOUNTS = [
  { label: 'User', email: 'demo@growl.app', description: 'Consumer feed & explore' },
  { label: 'Instructor', email: 'instructor@growl.app', description: 'Instructor privileges' },
  { label: 'Business', email: 'business@growl.app', description: 'Admin-provisioned business shell (dev seed)' },
] as const;
