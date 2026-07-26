import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type AchievementTier =
  | 'getting_started'
  | 'consistency'
  | 'community'
  | 'instructor'
  | 'milestones';

export type AchievementDef = {
  id: string;
  name: string;
  description: string;
  icon: IoniconName;
  tier: AchievementTier;
  /** Target progress value; 1 = boolean unlock */
  target: number;
  /** Which stat drives progress */
  metric:
    | 'postCount'
    | 'categoriesCount'
    | 'hasBio'
    | 'streakDays'
    | 'endorsementsReceived'
    | 'endorsementsGiven'
    | 'points'
    | 'canClaimInstructor'
    | 'isInstructor';
};

export type AchievementStats = {
  postCount: number;
  categoriesCount: number;
  hasBio: boolean;
  streakDays: number;
  endorsementsReceived: number;
  endorsementsGiven: number;
  points: number;
  canClaimInstructor: boolean;
  isInstructor: boolean;
};

export type EvaluatedAchievement = AchievementDef & {
  progress: number;
  unlocked: boolean;
};

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first_steps',
    name: 'First Steps',
    description: 'Share your first post with the community',
    icon: 'flag-outline',
    tier: 'getting_started',
    target: 1,
    metric: 'postCount',
  },
  {
    id: 'path_picker',
    name: 'Path Picker',
    description: 'Choose at least one growth path',
    icon: 'map-outline',
    tier: 'getting_started',
    target: 1,
    metric: 'categoriesCount',
  },
  {
    id: 'profile_voice',
    name: 'Profile Voice',
    description: 'Add a short bio to your profile',
    icon: 'create-outline',
    tier: 'getting_started',
    target: 1,
    metric: 'hasBio',
  },
  {
    id: 'streak_3',
    name: 'Momentum',
    description: 'Post on 3 consecutive days',
    icon: 'flash-outline',
    tier: 'consistency',
    target: 3,
    metric: 'streakDays',
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Post on 7 consecutive days',
    icon: 'flame-outline',
    tier: 'consistency',
    target: 7,
    metric: 'streakDays',
  },
  {
    id: 'first_endorse',
    name: 'Seen by Peers',
    description: 'Receive your first path endorsement',
    icon: 'hand-left-outline',
    tier: 'community',
    target: 1,
    metric: 'endorsementsReceived',
  },
  {
    id: 'endorsed_5',
    name: 'Endorsed',
    description: 'Collect 5 endorsements from shared paths',
    icon: 'people-outline',
    tier: 'community',
    target: 5,
    metric: 'endorsementsReceived',
  },
  {
    id: 'path_ally',
    name: 'Path Ally',
    description: 'Endorse 3 people on shared growth paths',
    icon: 'heart-outline',
    tier: 'community',
    target: 3,
    metric: 'endorsementsGiven',
  },
  {
    id: 'ready_to_claim',
    name: 'Ready to Claim',
    description: 'Meet the endorsement + posts bar for instructor',
    icon: 'ribbon-outline',
    tier: 'instructor',
    target: 1,
    metric: 'canClaimInstructor',
  },
  {
    id: 'claimed_instructor',
    name: 'Instructor',
    description: 'Claim your instructor status',
    icon: 'school-outline',
    tier: 'instructor',
    target: 1,
    metric: 'isInstructor',
  },
  {
    id: 'pts_100',
    name: 'Growing',
    description: 'Reach 100 growth points',
    icon: 'leaf-outline',
    tier: 'milestones',
    target: 100,
    metric: 'points',
  },
  {
    id: 'pts_250',
    name: 'Thriving',
    description: 'Reach 250 growth points',
    icon: 'sunny-outline',
    tier: 'milestones',
    target: 250,
    metric: 'points',
  },
  {
    id: 'pts_500',
    name: 'Established',
    description: 'Reach 500 growth points',
    icon: 'trophy-outline',
    tier: 'milestones',
    target: 500,
    metric: 'points',
  },
];

function metricValue(stats: AchievementStats, metric: AchievementDef['metric']): number {
  switch (metric) {
    case 'postCount':
      return stats.postCount;
    case 'categoriesCount':
      return stats.categoriesCount;
    case 'hasBio':
      return stats.hasBio ? 1 : 0;
    case 'streakDays':
      return stats.streakDays;
    case 'endorsementsReceived':
      return stats.endorsementsReceived;
    case 'endorsementsGiven':
      return stats.endorsementsGiven;
    case 'points':
      return stats.points;
    case 'canClaimInstructor':
      return stats.canClaimInstructor || stats.isInstructor ? 1 : 0;
    case 'isInstructor':
      return stats.isInstructor ? 1 : 0;
    default:
      return 0;
  }
}

export function evaluateAchievements(stats: AchievementStats): EvaluatedAchievement[] {
  return ACHIEVEMENTS.map((def) => {
    const raw = metricValue(stats, def.metric);
    const progress = Math.min(raw, def.target);
    return {
      ...def,
      progress,
      unlocked: raw >= def.target,
    };
  });
}

export const TIER_LABELS: Record<AchievementTier, string> = {
  getting_started: 'Getting started',
  consistency: 'Consistency',
  community: 'Community',
  instructor: 'Instructor path',
  milestones: 'Point milestones',
};
