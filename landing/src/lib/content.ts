export { APP_STORE_URL } from '@/lib/seo';

export const SUPPORT_EMAIL = 'support@letsgrow.lu';

export type Day = {
  id: string;
  name: string;
  initial: string;
  rest?: boolean;
};

/** The page is one week. Section ids match these. */
export const WEEK: Day[] = [
  { id: 'monday', name: 'Monday', initial: 'M' },
  { id: 'tuesday', name: 'Tuesday', initial: 'T' },
  { id: 'wednesday', name: 'Wednesday', initial: 'W', rest: true },
  { id: 'thursday', name: 'Thursday', initial: 'T' },
  { id: 'friday', name: 'Friday', initial: 'F' },
  { id: 'saturday', name: 'Saturday', initial: 'S' },
  { id: 'sunday', name: 'Sunday', initial: 'S' },
];
