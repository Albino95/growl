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
  theyEndorsedMe?: boolean;
  canRequestEndorsement?: boolean;
  pendingOutgoing?: boolean;
  pendingIncoming?: boolean;
  pendingIncomingRequestId?: string | null;
};

export type EndorsementIncomingRequest = {
  id: string;
  message: string | null;
  created_at: string;
  from: {
    id: string;
    username: string;
    avatar?: string | null;
    points: number;
    categories: string[];
    shared_categories: string[];
  };
};

export type InstructorEndorser = {
  id: string;
  username: string;
  avatar?: string | null;
  points: number;
  categories: string[];
  shared_categories?: string[];
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

export type InstructorOffering = {
  instructor_id?: string;
  weekly_fee_eur: number;
  sessions_per_week: number;
  typical_weeks: number;
  trial_days: number;
  currency: string;
  accepting: boolean;
  updated_at?: string;
};

export type DiscoverInstructor = {
  id: string;
  username: string;
  avatar?: string | null;
  points: number;
  vote_count: number;
  categories: string[];
  shared_categories: string[];
  teaching_headline?: string | null;
  created_at: string;
  weekly_fee_eur?: number | null;
  sessions_per_week?: number | null;
  typical_weeks?: number | null;
  trial_days?: number | null;
  currency?: string;
  accepting?: boolean;
  completed_plans?: number;
  rating_avg?: number | null;
  rating_count?: number;
};

export type CoachingReview = {
  id: string;
  stars: number;
  follow_through?: number | null;
  body: string | null;
  created_at: string;
  direction?: string;
  reviewer?: CoachingPerson;
};

export type ReviewEligibility = {
  weeks_completed: number;
  weeks_needed: number;
  eligible: boolean;
  direction: 'client_to_instructor' | 'instructor_to_client' | null;
  mine: CoachingReview | null;
};

export type CoachingPerson = {
  id: string;
  username: string;
  avatar?: string | null;
};

export type CoachingInquiry = {
  id: string;
  instructor_id: string;
  client_id: string;
  conversation_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  role?: 'instructor' | 'client';
  instructor?: CoachingPerson;
  client?: CoachingPerson;
};

export type CoachingProposal = {
  id: string;
  inquiry_id: string;
  instructor_id: string;
  client_id: string;
  conversation_id: string | null;
  weeks: number;
  sessions_per_week: number;
  weekly_fee_eur: number;
  total_eur: number;
  trial_days: number;
  currency: string;
  draw: string;
  note: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
};

export type CoachingContract = {
  id: string;
  proposal_id: string;
  inquiry_id: string;
  instructor_id: string;
  client_id: string;
  weeks: number;
  sessions_per_week: number;
  weekly_fee_eur: number;
  total_eur: number;
  trial_days: number;
  currency: string;
  draw: string;
  status: string;
  started_at: string;
  ends_at: string;
  completed_at: string | null;
  created_at: string;
  billing?: 'coming';
  role?: 'instructor' | 'client';
  instructor?: CoachingPerson;
  client?: CoachingPerson;
};

export type CoachingAssignment = {
  id: string;
  contract_id: string;
  seed_id: string;
  title: string;
  due_at: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  seed: {
    id: string;
    title: string | null;
    stage: string | null;
    growth_score: number;
    status: string | null;
    category_key: string | null;
    subcategory_key: string | null;
  };
  last_photo: string | null;
  last_action: string | null;
  last_activity_at: string | null;
};

export type CoachingThread = {
  inquiry: {
    id: string;
    instructor_id: string;
    client_id: string;
    conversation_id: string | null;
    status: string;
  } | null;
  proposal: CoachingProposal | null;
  contract: CoachingContract | null;
  offering: InstructorOffering | null;
  role: 'instructor' | 'client';
};

export type EndorsementSuggestion = {
  id: string;
  username: string;
  avatar?: string | null;
  points: number;
  categories: string[];
  shared_categories: string[];
  is_instructor: boolean;
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
    unread_messages?: number;
    learners?: number;
  };
  endorsers: InstructorEndorser[];
  learners?: InstructorEndorser[];
  pending_requests: InstructorPartnershipRequest[];
  partnerships: InstructorPartnership[];
  actions?: {
    teach_today?: boolean;
    open_inbox?: boolean;
    review_partners?: boolean;
    check_in_learners?: boolean;
  };
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

export async function listInstructors(params?: {
  limit?: number;
  offset?: number;
  category?: string;
  forPaths?: boolean;
}): Promise<DiscoverInstructor[]> {
  const query = new URLSearchParams();
  if (params?.limit) query.append('limit', String(params.limit));
  if (params?.offset) query.append('offset', String(params.offset));
  if (params?.category) query.append('category', params.category);
  if (params?.forPaths) query.append('for_paths', '1');
  const qs = query.toString();
  const res = await request<{
    success: boolean;
    data: { instructors: DiscoverInstructor[] };
  }>(`/instructor/instructors${qs ? `?${qs}` : ''}`);
  if (!res.success) throw new Error('Failed to load instructors');
  return res.data?.instructors ?? [];
}

export async function suggestEndorsers(): Promise<EndorsementSuggestion[]> {
  const res = await request<{
    success: boolean;
    data: { suggestions: EndorsementSuggestion[] };
  }>('/instructor/eligibility/suggest-endorsers');
  if (!res.success) throw new Error('Failed to load suggestions');
  return res.data?.suggestions ?? [];
}

export async function requestEndorsement(
  userId: string,
  message?: string
): Promise<{ requested: boolean; requestId: string }> {
  const res = await request<{
    success: boolean;
    data: { requested: boolean; requestId: string };
  }>(`/instructor/candidates/${encodeURIComponent(userId)}/request-endorsement`, {
    method: 'POST',
    body: JSON.stringify({ message: message || undefined }),
  });
  if (!res.success || !res.data) throw new Error('Failed to request endorsement');
  return res.data;
}

export async function listIncomingEndorsementRequests(): Promise<EndorsementIncomingRequest[]> {
  const res = await request<{
    success: boolean;
    data: { requests: EndorsementIncomingRequest[] };
  }>('/instructor/endorsement-requests');
  if (!res.success) throw new Error('Failed to load endorsement requests');
  return res.data?.requests ?? [];
}

export async function respondToEndorsementRequest(
  requestId: string,
  status: 'accepted' | 'declined'
): Promise<void> {
  const res = await request<{ success: boolean }>(
    `/instructor/endorsement-requests/${encodeURIComponent(requestId)}`,
    { method: 'PATCH', body: JSON.stringify({ status }) }
  );
  if (!res.success) throw new Error('Failed to update endorsement request');
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

export async function getMyOffering(): Promise<{
  offering: InstructorOffering;
  completed_plans: number;
}> {
  const res = await request<{
    success: boolean;
    data: { offering: InstructorOffering; completed_plans: number };
  }>('/instructor/offering');
  if (!res.success || !res.data) throw new Error('Failed to load offering');
  return res.data;
}

export async function updateMyOffering(input: {
  weekly_fee_eur: number;
  sessions_per_week: number;
  typical_weeks: number;
  trial_days: number;
  accepting: boolean;
}): Promise<InstructorOffering> {
  const res = await request<{ success: boolean; data: { offering: InstructorOffering } }>(
    '/instructor/offering',
    { method: 'PUT', body: JSON.stringify(input) }
  );
  if (!res.success || !res.data?.offering) throw new Error('Failed to save offering');
  return res.data.offering;
}

export async function startCoachingInquiry(
  instructorId: string,
  message?: string
): Promise<{ inquiry: CoachingInquiry; conversation_id: string | null; thread: CoachingThread }> {
  const res = await request<{
    success: boolean;
    data: { inquiry: CoachingInquiry; conversation_id: string | null; thread: CoachingThread };
  }>('/instructor/inquiries', {
    method: 'POST',
    body: JSON.stringify({ instructor_id: instructorId, message: message || undefined }),
  });
  if (!res.success || !res.data) throw new Error('Failed to reach instructor');
  return res.data;
}

export async function listCoachingInquiries(): Promise<CoachingInquiry[]> {
  const res = await request<{ success: boolean; data: { inquiries: CoachingInquiry[] } }>(
    '/instructor/inquiries'
  );
  if (!res.success) throw new Error('Failed to load inquiries');
  return res.data?.inquiries ?? [];
}

export async function getCoachingThread(peerId: string): Promise<CoachingThread> {
  const res = await request<{ success: boolean; data: CoachingThread }>(
    `/instructor/thread?peer_id=${encodeURIComponent(peerId)}`
  );
  if (!res.success || !res.data) throw new Error('Failed to load coaching thread');
  return res.data;
}

export async function sendCoachingProposal(input: {
  client_id: string;
  weeks: number;
  sessions_per_week: number;
  weekly_fee_eur: number;
  note?: string;
}): Promise<{ proposal: CoachingProposal; conversation_id: string }> {
  const res = await request<{
    success: boolean;
    data: { proposal: CoachingProposal; conversation_id: string };
  }>('/instructor/proposals', { method: 'POST', body: JSON.stringify(input) });
  if (!res.success || !res.data) throw new Error('Failed to send proposal');
  return res.data;
}

export async function acceptCoachingProposal(
  proposalId: string
): Promise<{ proposal: CoachingProposal; contract: CoachingContract | null }> {
  const res = await request<{
    success: boolean;
    data: { proposal: CoachingProposal; contract: CoachingContract | null };
  }>(`/instructor/proposals/${encodeURIComponent(proposalId)}/accept`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.success || !res.data) throw new Error('Failed to accept proposal');
  return res.data;
}

export async function declineCoachingProposal(
  proposalId: string
): Promise<{ proposal: CoachingProposal; contract: CoachingContract | null }> {
  const res = await request<{
    success: boolean;
    data: { proposal: CoachingProposal; contract: CoachingContract | null };
  }>(`/instructor/proposals/${encodeURIComponent(proposalId)}/decline`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  if (!res.success || !res.data) throw new Error('Failed to decline proposal');
  return res.data;
}

export async function listCoachingContracts(): Promise<CoachingContract[]> {
  const res = await request<{ success: boolean; data: { contracts: CoachingContract[] } }>(
    '/instructor/contracts'
  );
  if (!res.success) throw new Error('Failed to load plans');
  return res.data?.contracts ?? [];
}

export async function getCoachingContract(contractId: string): Promise<{
  contract: CoachingContract;
  assignments: CoachingAssignment[];
  review?: ReviewEligibility;
}> {
  const res = await request<{
    success: boolean;
    data: {
      contract: CoachingContract;
      assignments: CoachingAssignment[];
      review?: ReviewEligibility;
    };
  }>(`/instructor/contracts/${encodeURIComponent(contractId)}`);
  if (!res.success || !res.data) throw new Error('Failed to load plan');
  return res.data;
}

export async function completeCoachingContract(contractId: string): Promise<CoachingContract> {
  const res = await request<{ success: boolean; data: { contract: CoachingContract } }>(
    `/instructor/contracts/${encodeURIComponent(contractId)}/complete`,
    { method: 'POST', body: JSON.stringify({}) }
  );
  if (!res.success || !res.data?.contract) throw new Error('Failed to complete plan');
  return res.data.contract;
}

export async function assignCoachingHomework(
  contractId: string,
  input: {
    title?: string;
    category_key?: string;
    subcategory_key?: string;
    due_at?: string;
    goal_detail?: string;
    seed_id?: string;
  }
): Promise<{ assignment: CoachingAssignment; assignments: CoachingAssignment[] }> {
  const res = await request<{
    success: boolean;
    data: { assignment: CoachingAssignment; assignments: CoachingAssignment[] };
  }>(`/instructor/contracts/${encodeURIComponent(contractId)}/assignments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.success || !res.data) throw new Error('Failed to assign homework');
  return res.data;
}

export async function listInstructorReviews(instructorId: string): Promise<{
  reviews: CoachingReview[];
  rating: { avg: number; count: number };
}> {
  const res = await request<{
    success: boolean;
    data: { reviews: CoachingReview[]; rating: { avg: number; count: number } };
  }>(`/instructor/instructors/${encodeURIComponent(instructorId)}/reviews`);
  if (!res.success || !res.data) throw new Error('Failed to load reviews');
  return res.data;
}

export async function getReviewEligibility(peerId: string): Promise<ReviewEligibility> {
  const res = await request<{ success: boolean; data: ReviewEligibility }>(
    `/instructor/reviews/eligibility?peer_id=${encodeURIComponent(peerId)}`
  );
  if (!res.success || !res.data) throw new Error('Failed to load review eligibility');
  return res.data;
}

export async function submitCoachingReview(input: {
  peer_id: string;
  contract_id?: string;
  stars: number;
  follow_through?: number;
  body?: string;
}): Promise<CoachingReview> {
  const res = await request<{ success: boolean; data: { review: CoachingReview } }>(
    '/instructor/reviews',
    { method: 'POST', body: JSON.stringify(input) }
  );
  if (!res.success || !res.data?.review) throw new Error('Failed to save review');
  return res.data.review;
}

export function formatOfferLine(offer: {
  weekly_fee_eur?: number | null;
  sessions_per_week?: number | null;
  typical_weeks?: number | null;
  trial_days?: number | null;
}): string | null {
  if (offer.weekly_fee_eur == null || offer.sessions_per_week == null) return null;
  const weeks = offer.typical_weeks || 1;
  const total = Math.round(weeks * offer.weekly_fee_eur * 100) / 100;
  const trial =
    offer.trial_days && offer.trial_days > 0 ? ` · ${offer.trial_days}-day trial` : '';
  return `€${offer.weekly_fee_eur}/wk · ${offer.sessions_per_week}× · ${weeks} wk · €${total}${trial}`;
}
