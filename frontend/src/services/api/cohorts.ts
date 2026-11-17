/**
 * Group (cohort) plans API — backend/src/routes/wave3/cohorts.ts.
 * One coach, 2–150 members, invite-only. No payments through Grow! yet.
 * Every call throws ApiError; a 404 on GET /cohorts means the feature isn't deployed.
 */
import { request, newIdempotencyKey } from './http';
import type { Proof } from './proofs';

type Envelope<T> = { success: boolean; data: T };

export type CohortUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export type CohortRole = 'coach' | 'member' | 'invited';

export type Cohort = {
  id: string;
  title: string;
  path: string | null;
  description: string | null;
  weeks: number;
  start_date: string;
  end_date: string;
  /** 0 = not started yet, weeks + 1 = finished. */
  current_week: number;
  capacity: number;
  visibility: 'invite' | string;
  status: 'active' | 'archived' | string;
  member_count: number;
  spots_left: number;
  role: CohortRole;
  coach: CohortUser;
  /** Coach only. */
  invite_code: string | null;
  invite_link: string | null;
  billing_note: string;
  created_at: string;
};

export type CohortInvite = { cohort: Cohort; invited_at: string };

export type CohortsPayload = { coaching: Cohort[]; member: Cohort[]; invites: CohortInvite[] };

export type CohortMember = { user: CohortUser; joined_at: string; /** coach only */ last_active_at?: string | null };

export type CohortDetail = {
  cohort: Cohort;
  members: CohortMember[];
  group: { completion_pct: number } | null;
  mine: { done: number; total: number; pct: number } | null;
};

export type CohortReply = { id: string; post_id: string; author: CohortUser; body: string; created_at: string };

export type CohortPost = {
  id: string;
  cohort_id: string;
  author: CohortUser;
  body: string;
  media_url: string | null;
  hearts: number;
  hearted_by_me: boolean;
  reply_count: number;
  /** Latest (up to 3) replies, oldest first. */
  replies: CohortReply[];
  created_at: string;
};

export type ProofKind = Proof['kind'];

export type CohortAssignment = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  proof_kind: ProofKind | null;
  created_at: string;
  /** Share of active members who finished (done or partly). */
  completion_pct: number;
};

export type CohortHomeworkStatus = 'assigned' | 'done' | 'partly';

export type MyCohortHomework = {
  id: string;
  status: CohortHomeworkStatus;
  completed_at: string | null;
  proof_id: string | null;
  proof_kind: ProofKind | null;
  seen_at: string | null;
};

export type CoachAssignment = CohortAssignment & { done: number; partly: number; total: number };

export type CohortCell = {
  /** Member homework id (cohort_asg_…), the proof context id. */
  id: string;
  assignment_id: string;
  user_id: string;
  status: CohortHomeworkStatus;
  completed_at: string | null;
  seen_at: string | null;
  proof: Proof | null;
};

export type CoachHomework = {
  role: 'coach';
  assignments: CoachAssignment[];
  members: CohortUser[];
  cells: CohortCell[];
};

export type MemberHomework = {
  role: 'member';
  assignments: (CohortAssignment & { mine: MyCohortHomework })[];
};

export type CohortProgress = {
  week: { from: string; to: string; current_week: number; weeks: number };
  members_total: number;
  active_this_week: number;
  active_pct: number;
  completion_pct: number;
  completions_this_week: { done: number; total: number };
  overall_completion_pct: number;
  needs_attention: { user: CohortUser; last_active_day: string | null; days_inactive: number }[];
  inactive_days_threshold: number;
};

export type InviteCandidate = { user: CohortUser; source: 'client' | 'friend'; invited: boolean };

export type CreateCohortInput = {
  title: string;
  path?: string | null;
  description?: string | null;
  weeks: number;
  start_date: string;
  capacity: number;
};

const enc = encodeURIComponent;

export async function listCohorts(): Promise<CohortsPayload> {
  const res = await request<Envelope<Partial<CohortsPayload>>>('/cohorts');
  const d = res.data || {};
  return { coaching: d.coaching ?? [], member: d.member ?? [], invites: d.invites ?? [] };
}

export async function createCohort(input: CreateCohortInput): Promise<Cohort> {
  const res = await request<Envelope<{ cohort: Cohort }>>('/cohorts', {
    method: 'POST',
    body: JSON.stringify(input),
    idempotencyKey: newIdempotencyKey(),
  });
  return res.data.cohort;
}

export async function getCohort(id: string): Promise<CohortDetail> {
  const res = await request<Envelope<CohortDetail>>(`/cohorts/${enc(id)}`);
  return res.data;
}

export async function updateCohort(
  id: string,
  patch: Partial<CreateCohortInput> & { status?: 'active' | 'archived' }
): Promise<CohortDetail> {
  const res = await request<Envelope<CohortDetail>>(`/cohorts/${enc(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return res.data;
}

export async function previewCohortByCode(code: string): Promise<Cohort> {
  const res = await request<Envelope<{ cohort: Cohort }>>(`/cohorts/preview?code=${enc(code)}`);
  return res.data.cohort;
}

export async function rotateCohortCode(id: string): Promise<{ invite_code: string; invite_link: string }> {
  const res = await request<Envelope<{ invite_code: string; invite_link: string }>>(
    `/cohorts/${enc(id)}/invite-code`,
    { method: 'POST' }
  );
  return res.data;
}

export async function joinCohort(input: { code: string } | { cohort_id: string }): Promise<CohortDetail> {
  const res = await request<Envelope<CohortDetail>>('/cohorts/join', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data;
}

export async function leaveCohort(id: string): Promise<void> {
  await request(`/cohorts/${enc(id)}/leave`, { method: 'POST' });
}

export async function declineCohortInvite(id: string): Promise<void> {
  await request(`/cohorts/${enc(id)}/decline`, { method: 'POST' });
}

export async function removeCohortMember(id: string, userId: string): Promise<void> {
  await request(`/cohorts/${enc(id)}/members/${enc(userId)}`, { method: 'DELETE' });
}

export async function listInviteCandidates(id: string): Promise<InviteCandidate[]> {
  const res = await request<Envelope<{ candidates: InviteCandidate[] }>>(`/cohorts/${enc(id)}/invite-candidates`);
  return res.data?.candidates ?? [];
}

export async function inviteToCohort(id: string, userIds: string[]): Promise<{ invited: number; skipped: number }> {
  const res = await request<Envelope<{ invited: number; skipped: number }>>(`/cohorts/${enc(id)}/invites`, {
    method: 'POST',
    body: JSON.stringify({ user_ids: userIds }),
  });
  return res.data;
}

export async function listCohortPosts(
  id: string,
  before?: string | null
): Promise<{ posts: CohortPost[]; next_cursor: string | null }> {
  const q = before ? `?before=${enc(before)}` : '';
  const res = await request<Envelope<{ posts: CohortPost[]; next_cursor: string | null }>>(
    `/cohorts/${enc(id)}/posts${q}`
  );
  return { posts: res.data?.posts ?? [], next_cursor: res.data?.next_cursor ?? null };
}

export async function createCohortPost(id: string, body: string, mediaUrl?: string | null): Promise<CohortPost> {
  const res = await request<Envelope<{ post: CohortPost }>>(`/cohorts/${enc(id)}/posts`, {
    method: 'POST',
    body: JSON.stringify({ body, media_url: mediaUrl ?? null }),
    idempotencyKey: newIdempotencyKey(),
  });
  return res.data.post;
}

export async function deleteCohortPost(id: string, postId: string): Promise<void> {
  await request(`/cohorts/${enc(id)}/posts/${enc(postId)}`, { method: 'DELETE' });
}

export async function listCohortReplies(id: string, postId: string): Promise<CohortReply[]> {
  const res = await request<Envelope<{ replies: CohortReply[] }>>(`/cohorts/${enc(id)}/posts/${enc(postId)}/replies`);
  return res.data?.replies ?? [];
}

export async function replyToCohortPost(id: string, postId: string, body: string): Promise<CohortReply> {
  const res = await request<Envelope<{ reply: CohortReply }>>(`/cohorts/${enc(id)}/posts/${enc(postId)}/replies`, {
    method: 'POST',
    body: JSON.stringify({ body }),
    idempotencyKey: newIdempotencyKey(),
  });
  return res.data.reply;
}

export async function heartCohortPost(id: string, postId: string): Promise<{ hearts: number; hearted_by_me: boolean }> {
  const res = await request<Envelope<{ hearts: number; hearted_by_me: boolean }>>(
    `/cohorts/${enc(id)}/posts/${enc(postId)}/react`,
    { method: 'POST' }
  );
  return res.data;
}

export async function getCohortHomework(id: string): Promise<CoachHomework | MemberHomework> {
  const res = await request<Envelope<CoachHomework | MemberHomework>>(`/cohorts/${enc(id)}/homework`);
  return res.data;
}

export async function assignCohortHomework(
  id: string,
  input: { title: string; description?: string | null; due_at?: string | null; proof_kind?: ProofKind | null }
): Promise<{ assignment: CohortAssignment; assigned: number }> {
  const res = await request<Envelope<{ assignment: CohortAssignment; assigned: number }>>(
    `/cohorts/${enc(id)}/homework`,
    { method: 'POST', body: JSON.stringify(input), idempotencyKey: newIdempotencyKey() }
  );
  return res.data;
}

export async function deleteCohortHomework(id: string, assignmentId: string): Promise<void> {
  await request(`/cohorts/${enc(id)}/homework/${enc(assignmentId)}`, { method: 'DELETE' });
}

export async function completeCohortHomework(
  id: string,
  input: { member_assignment_id: string; status: CohortHomeworkStatus; proof_id?: string | null; proof_kind?: ProofKind | null }
): Promise<MyCohortHomework> {
  const res = await request<Envelope<{ mine: MyCohortHomework }>>(`/cohorts/${enc(id)}/homework/complete`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data.mine;
}

export async function markCohortHomeworkSeen(
  id: string,
  input: { member_assignment_ids?: string[]; assignment_id?: string }
): Promise<number> {
  const res = await request<Envelope<{ updated: number }>>(`/cohorts/${enc(id)}/homework/seen`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.data?.updated ?? 0;
}

export async function getCohortProgress(id: string): Promise<CohortProgress> {
  const res = await request<Envelope<CohortProgress>>(`/cohorts/${enc(id)}/progress`);
  return res.data;
}
