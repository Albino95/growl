/**
 * Growth system API (streak, Today check-in, badges, recap, progress,
 * challenges, invites). Contract: docs/GROWTH_SYSTEM.md.
 */
import { request, localDayKey } from './http';

type Envelope<T> = { success: boolean; data: T };

async function get<T>(path: string): Promise<T> {
  const res = await request<Envelope<T>>(path);
  return res.data;
}

async function send<T>(path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const res = await request<Envelope<T>>(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  return res.data;
}

// ---------- Streak ----------
export type StreakDayStatus = 'active' | 'rest' | 'missed' | 'future' | 'today';
export type Streak = {
  current: number;
  longest: number;
  total_days: number;
  rest_days_left: number;
  last_active_day: string | null;
  today_done: boolean;
  today: string;
  week: { day: string; status: StreakDayStatus }[];
};
export const getStreak = () => get<Streak>('/me/streak');

// ---------- Badges ----------
export type BadgeEarned = { id: string; name: string; description: string; points: number };
export type BadgeCatalogItem = {
  id: string;
  name: string;
  description: string;
  category: 'start' | 'consistency' | 'community' | 'explore';
  tier: 'common' | 'rare';
  points: number;
  progress: { current: number; target: number };
};
export type GrowthLevel = { n: number; name: string; points: number; next_at: number | null };
export type MyBadges = {
  earned: { id: string; earned_at: string; seen: boolean }[];
  catalog: BadgeCatalogItem[];
  next: { id: string; name: string; progress: { current: number; target: number } } | null;
  level: GrowthLevel;
};
export const getMyBadges = () => get<MyBadges>('/me/badges');
export const markBadgesSeen = (ids: string[]) => send<{ ok: true }>('/me/badges/seen', 'POST', { ids });
export const getUserBadges = (userId: string) =>
  get<{ earned: { id: string; earned_at: string }[]; level: GrowthLevel }>(
    `/users/${encodeURIComponent(userId)}/badges`
  );

// ---------- Today check-in ----------
export type Mood = 1 | 2 | 3 | 4 | 5;
export type Checkin = {
  day: string;
  mood: Mood | null;
  path: string | null;
  intention: string | null;
  rest: boolean;
  followup: 'yes' | 'partly' | 'no' | null;
  created_at: string;
};
export type TodayState = { checkin: Checkin | null; streak: Streak };
export type CheckinInput = {
  mood?: Mood;
  path?: string | null;
  intention?: string | null;
  rest?: boolean;
  followup?: 'yes' | 'partly' | 'no';
};
export type CheckinResult = {
  checkin: Checkin;
  streak: Streak;
  points_awarded: number;
  new_badges: BadgeEarned[];
};
export const getToday = () => get<TodayState>(`/me/today?day=${localDayKey()}`);
export const saveToday = (input: CheckinInput) =>
  send<CheckinResult>('/me/today', 'PUT', { day: localDayKey(), ...input });

// ---------- Weekly recap ----------
export type WeeklyRecap = {
  week: string;
  start: string;
  end: string;
  is_first_week: boolean;
  empty: boolean;
  active_days: number;
  days: { day: string; active: boolean; rest: boolean }[];
  current_streak: number;
  posts: number;
  reels: number;
  stories: number;
  journal_entries: number;
  checkins: number;
  encouragement_received: number;
  new_friends: number;
  top_path: string | null;
  badges_earned: string[];
  avg_mood: number | null;
  reflection: string;
};
export const getWeeklyRecap = (week?: string) =>
  get<WeeklyRecap>(`/me/recap${week ? `?week=${encodeURIComponent(week)}` : ''}`);

// ---------- Progress ----------
export type Progress = {
  days: { day: string; active: boolean; rest: boolean; kinds: number; mood: number | null }[];
  by_path: { path: string; count: number }[];
  mood_by_week: { week: string; avg: number | null }[];
  longest_streak: number;
  total_active_days: number;
};
export const getProgress = (rangeDays = 90) => get<Progress>(`/me/progress?range=${rangeDays}`);

// ---------- Challenges ----------
export type Challenge = {
  id: string;
  path: string;
  title: string;
  description: string;
  target_days: number;
  duration_days: number;
  emoji: string;
};
export type ChallengeSummary = Challenge & {
  joined: boolean;
  progress: number;
  ends_at?: string;
  completed: boolean;
  participants: number;
};
export type ChallengeDetail = Challenge & {
  joined: boolean;
  progress: number;
  joined_at?: string;
  ends_at?: string;
  completed: boolean;
  days: { day: string; done: boolean }[];
  leaderboard: { user_id: string; username: string; avatar: string | null; progress: number; is_me: boolean }[];
};
export const getChallenges = (path?: string) =>
  get<{ challenges: ChallengeSummary[] }>(`/challenges${path ? `?path=${encodeURIComponent(path)}` : ''}`);
export const getChallenge = (id: string) => get<ChallengeDetail>(`/challenges/${encodeURIComponent(id)}`);
export const joinChallenge = (id: string) =>
  send<ChallengeDetail>(`/challenges/${encodeURIComponent(id)}/join`, 'POST');
export const leaveChallenge = (id: string) =>
  send<{ ok: true }>(`/challenges/${encodeURIComponent(id)}/join`, 'DELETE');

// ---------- Invites ----------
export type MyInvite = { code: string; url: string; invited_count: number; rewarded_count: number };
export const getMyInvite = () => get<MyInvite>('/me/invite');
export const lookupInvite = (code: string) =>
  get<{ inviter: { username: string; avatar: string | null } }>(`/invites/${encodeURIComponent(code)}`);
export const redeemInvite = (code: string) =>
  send<{ inviter: { username: string; avatar: string | null }; friend: boolean }>('/me/invite/redeem', 'POST', {
    code,
  });

/** Growth level ladder (mirrors backend) for offline display. */
export const GROWTH_LEVELS = [
  { n: 1, name: 'Seed', at: 0 },
  { n: 2, name: 'Sprout', at: 50 },
  { n: 3, name: 'Sapling', at: 150 },
  { n: 4, name: 'Bloom', at: 400 },
  { n: 5, name: 'Tree', at: 1000 },
  { n: 6, name: 'Grove', at: 2500 },
] as const;
