/**
 * Instructor eligibility, claim, and peer endorsement APIs.
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
