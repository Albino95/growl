import { request } from './http';

export type SeedStage = 'seed' | 'sprout' | 'sapling' | 'tree' | 'mature';
export type SeedStatus = 'growing' | 'resting' | 'mature' | 'archived' | 'pending_accept';
export type SeedMemberRole = 'owner' | 'witness' | 'instructor';

export type SeedMember = {
  user_id: string;
  role: SeedMemberRole;
  status: 'active' | 'pending' | string;
  joined_at: string;
  username: string;
  avatar?: string | null;
  is_instructor?: boolean;
};

export type GrowthSeed = {
  id: string;
  category_key: string;
  subcategory_key: string;
  title: string;
  stage: SeedStage | string;
  growth_score: number;
  status: SeedStatus | string;
  ownership: 'solo' | 'shared' | string;
  visibility: string;
  planted_by_user_id: string;
  planted_at: string;
  matured_at?: string | null;
  resting_at?: string | null;
  progress_to_mature: number;
  next_threshold: number;
  days_since_planted?: number;
  metric_type?: string | null;
  metric_unit?: string | null;
  metric_start?: number | null;
  metric_target?: number | null;
  metric_current?: number | null;
  metric_progress?: number | null;
  goal_detail?: string | null;
  members: SeedMember[];
};

export type SeedActivity = {
  id: string;
  actor_user_id: string;
  username: string;
  action: string;
  delta: number;
  created_at: string;
  note?: string | null;
  photo_url?: string | null;
  metric_value?: number | null;
  days_since_plant?: number | null;
};

export async function listSeeds(scope: 'growing' | 'garden' | 'all' = 'growing') {
  const res = await request<{
    success: boolean;
    data: {
      seeds: GrowthSeed[];
      matured_tree_count: number;
      active_growing_count: number;
      max_active: number;
    };
  }>(`/seeds?scope=${encodeURIComponent(scope)}`);
  return res.data;
}

export async function createSeed(input: {
  category_key: string;
  subcategory_key: string;
  title?: string;
  invite_user_id?: string;
  invite_role?: 'witness' | 'owner' | 'instructor';
  metric_type?: string;
  metric_unit?: string;
  metric_start?: number;
  metric_target?: number;
  goal_detail?: string;
}) {
  const res = await request<{ success: boolean; data: { seed: GrowthSeed } }>('/seeds', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data.seed;
}

export async function getSeed(seedId: string) {
  const res = await request<{
    success: boolean;
    data: {
      seed: GrowthSeed;
      activity: SeedActivity[];
      my_role: SeedMemberRole;
      my_member_status: string;
    };
  }>(`/seeds/${encodeURIComponent(seedId)}`);
  return res.data;
}

export async function waterSeed(
  seedId: string,
  input: {
    action?: 'check_in' | 'journal' | 'water' | 'instructor_tend' | 'breathe';
    note?: string;
    photo_url?: string;
    metric_value?: number;
  } = {}
) {
  const res = await request<{
    success: boolean;
    data: { seed: GrowthSeed; staged_up: boolean; can_mature: boolean };
  }>(`/seeds/${encodeURIComponent(seedId)}/water`, {
    method: 'POST',
    body: JSON.stringify({
      action: input.action || 'check_in',
      note: input.note,
      photo_url: input.photo_url,
      metric_value: input.metric_value,
    }),
  });
  return res.data;
}

export async function acceptSeedInvite(seedId: string) {
  const res = await request<{ success: boolean; data: { seed: GrowthSeed } }>(
    `/seeds/${encodeURIComponent(seedId)}/accept`,
    { method: 'POST', body: JSON.stringify({}) }
  );
  return res.data.seed;
}

export async function matureSeed(seedId: string) {
  const res = await request<{ success: boolean; data: { seed: GrowthSeed } }>(
    `/seeds/${encodeURIComponent(seedId)}/mature`,
    { method: 'POST', body: JSON.stringify({}) }
  );
  return res.data.seed;
}

export async function inviteToSeed(
  seedId: string,
  userId: string,
  role: 'witness' | 'owner' | 'instructor' = 'witness'
) {
  const res = await request<{ success: boolean; data: { seed: GrowthSeed } }>(
    `/seeds/${encodeURIComponent(seedId)}/invite`,
    {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, role }),
    }
  );
  return res.data.seed;
}
