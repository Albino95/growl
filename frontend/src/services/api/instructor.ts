/**
 * Instructor eligibility, claim, endorsement, and hub APIs.
 */
import { request } from './http';

export type InstructorEligibility = {
  alreadyInstructor: boolean;
  endorsementsReceived: number;
  endorsementsNeeded: number;
  postCount: number;
  postsNeeded: number;
  eligible: boolean;
  canClaim: boolean;
};

export type EndorsementStatus = {
  canEndorse: boolean;
  alreadyEndorsed: boolean;
  sharedCategories: string[];
  endorsementCount: number;
  isSelf: boolean;
  isInstructor: boolean;
};

export type InstructorEndorser = {
  id: string;
  username: string;
  avatar?: string | null;
  points: number;
  categories: string[];
  endorsed_at: string;
  is_friend: boolean;
};

export type InstructorPartnershipRequest = {
  id: string;
  business_id: string;
  business_name: string;
  business_avatar?: string | null;
  partnership_type: string;
  commission_rate: number | null;
  fixed_fee: number | null;
  message: string | null;
  created_at: string;
};

export type InstructorPartnership = {
  id: string;
  business_id: string;
  business_name: string;
  business_avatar?: string | null;
  partnership_type: string;
  commission_rate: number | null;
  fixed_fee: number | null;
  status: string;
  created_at: string;
  updated_at: string;
  attributed_revenue: number;
  attributed_orders: number;
};

export type InstructorHub = {
  stats: {
    points: number;
    endorsements: number;
    posts: number;
    endorsers: number;
    pending_requests: number;
    active_partnerships: number;
    referral_revenue: number;
    referral_orders: number;
  };
  endorsers: InstructorEndorser[];
  pending_requests: InstructorPartnershipRequest[];
  partnerships: InstructorPartnership[];
};

export async function getInstructorEligibility(): Promise<InstructorEligibility> {
  const res = await request<{ success: boolean; data: InstructorEligibility }>(
    '/instructor/eligibility'
  );
  if (!res.success || !res.data) throw new Error('Failed to load eligibility');
  return res.data;
}

export async function claimInstructor(): Promise<
  InstructorEligibility & {
    claimed: boolean;
    message: string;
    points_awarded?: number;
    points_total?: number;
  }
> {
  const res = await request<{
    success: boolean;
    data: InstructorEligibility & {
      claimed: boolean;
      message: string;
      points_awarded?: number;
      points_total?: number;
    };
  }>('/instructor/claim', { method: 'POST', body: JSON.stringify({}) });
  if (!res.success || !res.data) throw new Error('Failed to claim instructor status');
  return res.data;
}

export async function endorseCandidate(userId: string): Promise<{
  endorsed: boolean;
  endorsementCount: number;
  sharedCategories: string[];
  points_awarded_voter?: number;
  points_total_voter?: number;
}> {
  const res = await request<{
    success: boolean;
    data: {
      endorsed: boolean;
      endorsementCount: number;
      sharedCategories: string[];
      message: string;
      points_awarded_voter?: number;
      points_total_voter?: number;
    };
  }>(`/instructor/instructors/${encodeURIComponent(userId)}/vote`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.success || !res.data) throw new Error('Failed to endorse');
  return res.data;
}

export async function getEndorsementStatus(userId: string): Promise<EndorsementStatus> {
  const res = await request<{ success: boolean; data: EndorsementStatus }>(
    `/instructor/candidates/${encodeURIComponent(userId)}/endorsement-status`
  );
  if (!res.success || !res.data) throw new Error('Failed to load endorsement status');
  return res.data;
}

export async function getInstructorHub(): Promise<InstructorHub> {
  const res = await request<{ success: boolean; data: InstructorHub }>('/instructor/hub');
  if (!res.success || !res.data) throw new Error('Failed to load instructor hub');
  return res.data;
}

export async function respondToPartnershipRequest(
  requestId: string,
  status: 'approved' | 'declined'
): Promise<void> {
  const res = await request<{ success: boolean }>(
    `/instructor/partnerships/requests/${encodeURIComponent(requestId)}`,
    { method: 'PATCH', body: JSON.stringify({ status }) }
  );
  if (!res.success) throw new Error('Failed to update partnership request');
}

export async function updateInstructorPartnership(
  partnershipId: string,
  status: 'active' | 'paused' | 'ended'
): Promise<void> {
  const res = await request<{ success: boolean }>(
    `/instructor/partnerships/${encodeURIComponent(partnershipId)}`,
    { method: 'PATCH', body: JSON.stringify({ status }) }
  );
  if (!res.success) throw new Error('Failed to update partnership');
}
