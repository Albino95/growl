import { request } from './http';

export type CircleMatchMode = 'nearby' | 'matching' | 'mix' | 'random';

export type CirclePrefs = {
  match: CircleMatchMode;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
};

export type GrowthGroup = {
  id: string;
  slug: string | null;
  name: string;
  path_key: string;
  kind: 'starting' | 'user' | 'cohort' | string;
  description: string | null;
  accent: string;
  created_by: string | null;
  created_at: string;
  parent_id?: string | null;
  city?: string | null;
  country?: string | null;
  member_count: number;
  max_members: number;
  seats_left: number;
  is_full: boolean;
  vibe?: 'warming' | 'live' | 'full';
  pulse_count: number;
  joined: boolean;
  role: string | null;
  last_pulse_at: string | null;
  last_activity_at?: string | null;
  already_in?: boolean;
  calls: {
    voice_waitlist: number;
    video_waitlist: number;
    voice_available: boolean;
    video_available: boolean;
  };
};

export type GroupMember = {
  user_id: string;
  role: string;
  joined_at: string;
  last_pulse_at: string | null;
  username: string;
  avatar: string | null;
};

export type GroupPulse = {
  id: string;
  user_id: string;
  note: string | null;
  created_at: string;
  username: string;
  avatar: string | null;
};

export const DEFAULT_CIRCLE_PREFS: CirclePrefs = {
  match: 'mix',
  city: null,
  country: null,
  lat: null,
  lng: null,
};

export async function listGroups() {
  const res = await request<{
    success: boolean;
    data: {
      groups: GrowthGroup[];
      mine: GrowthGroup[];
      starting: GrowthGroup[];
      templates?: GrowthGroup[];
      suggested: GrowthGroup[];
      prefs?: CirclePrefs;
      max_members?: number;
      paths: string[];
    };
  }>('/groups');
  if (!res.success || !res.data) throw new Error('Failed to load circles');
  return {
    ...res.data,
    templates: res.data.templates || res.data.starting || [],
    prefs: res.data.prefs || DEFAULT_CIRCLE_PREFS,
    max_members: res.data.max_members || 10,
  };
}

export async function getGroup(id: string) {
  const res = await request<{
    success: boolean;
    data: {
      group: GrowthGroup;
      members: GroupMember[];
      pulses: GroupPulse[];
      my_call_interest: string[];
      prefs?: CirclePrefs;
    };
  }>(`/groups/${encodeURIComponent(id)}`);
  if (!res.success || !res.data) throw new Error('Failed to load circle');
  return res.data;
}

export async function createGroup(input: {
  name: string;
  path_key: string;
  description?: string;
}) {
  const res = await request<{ success: boolean; data: { group: GrowthGroup } }>('/groups', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.success || !res.data?.group) throw new Error('Failed to create circle');
  return res.data.group;
}

export async function updateCirclePrefs(input: Partial<CirclePrefs>) {
  const res = await request<{ success: boolean; data: { prefs: CirclePrefs } }>('/groups/prefs', {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
  if (!res.success || !res.data?.prefs) throw new Error('Failed to save seating preference');
  return res.data.prefs;
}

export async function placeGroup(pathKey: string) {
  const res = await request<{
    success: boolean;
    data: { group: GrowthGroup; created?: boolean; placed?: boolean };
  }>('/groups/place', {
    method: 'POST',
    body: JSON.stringify({ path_key: pathKey }),
  });
  if (!res.success || !res.data?.group) throw new Error('Failed to find a circle');
  return res.data;
}

export async function joinGroup(id: string) {
  const res = await request<{
    success: boolean;
    data: { ok?: boolean; group?: GrowthGroup; placed?: boolean; created?: boolean };
  }>(`/groups/${encodeURIComponent(id)}/join`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.success) throw new Error('Failed to join circle');
  return res.data || {};
}

export async function leaveGroup(id: string) {
  const res = await request<{ success: boolean; data: { ok?: boolean; closed?: boolean } }>(
    `/groups/${encodeURIComponent(id)}/leave`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    }
  );
  if (!res.success) throw new Error('Failed to leave circle');
  return res.data || {};
}

export async function pulseGroup(id: string, note?: string) {
  await request(`/groups/${encodeURIComponent(id)}/pulse`, {
    method: 'POST',
    body: JSON.stringify({ note: note || null }),
  });
}

export async function signalCallInterest(id: string, kind: 'voice' | 'video') {
  await request(`/groups/${encodeURIComponent(id)}/call-interest`, {
    method: 'POST',
    body: JSON.stringify({ kind }),
  });
}
