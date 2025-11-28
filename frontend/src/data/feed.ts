export type FeedItem = { id: number; title: string; subtitle: string; body: string; };
const FEED: FeedItem[] = [
  { id: 1, title: 'Welcome to Growl', subtitle: 'Start strong', body: 'Track your progress and stay accountable.' },
  { id: 2, title: 'Coach tips', subtitle: 'Mindset', body: 'Consistency beats intensity.' },
];
export default FEED;
