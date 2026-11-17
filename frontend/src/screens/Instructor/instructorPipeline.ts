import type {
  CoachingContract,
  CoachingInquiry,
  InstructorEligibility,
} from '../../services/api/instructor';

export type OnboardingStep = {
  key: 'endorse' | 'posts' | 'claim' | 'offer';
  label: string;
  detail: string | null;
  done: boolean;
  current: boolean;
};

/** Path to becoming a coach: endorsements → posts → claim → offer, with one clear next step. */
export function onboardingSteps(e: InstructorEligibility): OnboardingStep[] {
  const endorseDone = e.endorsementsReceived >= e.endorsementsNeeded;
  const postsDone = e.postCount >= e.postsNeeded;
  const claimed = !!e.alreadyInstructor;
  const raw: Omit<OnboardingStep, 'current'>[] = [
    {
      key: 'endorse',
      label: `Get ${e.endorsementsNeeded} endorsement${e.endorsementsNeeded === 1 ? '' : 's'} from peers`,
      detail: `${Math.min(e.endorsementsReceived, e.endorsementsNeeded)} of ${e.endorsementsNeeded}`,
      done: endorseDone || claimed,
    },
    {
      key: 'posts',
      label: `Share ${e.postsNeeded} progress post${e.postsNeeded === 1 ? '' : 's'}`,
      detail: `${Math.min(e.postCount, e.postsNeeded)} of ${e.postsNeeded}`,
      done: postsDone || claimed,
    },
    {
      key: 'claim',
      label: 'Claim instructor status',
      detail: e.canClaim && !claimed ? 'You’re ready — claim below' : null,
      done: claimed,
    },
    {
      key: 'offer',
      label: 'Set your weekly offer',
      detail: 'Fee, times per week and trial. Payment is agreed directly with clients.',
      done: false,
    },
  ];
  const firstOpen = raw.findIndex((s) => !s.done);
  return raw.map((s, i) => ({ ...s, current: i === firstOpen }));
}

export type PipelineGroups = {
  talking: CoachingInquiry[];
  proposalSent: CoachingInquiry[];
  declined: CoachingInquiry[];
  active: CoachingContract[];
  completed: CoachingContract[];
  /** Everyone still in motion (talking, proposals, active plans). */
  openCount: number;
  /** Rows waiting on the coach (talking / declined → send a proposal). */
  needsYou: number;
  summary: string;
};

/**
 * Instructor pipeline: inquiries → proposals → active plans. Inquiries whose client
 * already has an active plan are shown only under Active (no duplicate row).
 * Older servers send no `stage`; those rows count as "talking".
 */
export function pipelineGroups(
  inquiries: CoachingInquiry[],
  contracts: CoachingContract[]
): PipelineGroups {
  const active = contracts.filter((c) => c.status === 'active');
  const completed = contracts.filter((c) => c.status === 'completed');
  const activeClients = new Set(active.map((c) => c.client_id));
  const open = inquiries.filter(
    (i) => i.status !== 'closed' && i.stage !== 'closed' && i.stage !== 'active' && !activeClients.has(i.client_id)
  );
  const proposalSent = open.filter((i) => i.stage === 'proposal_sent');
  const declined = open.filter((i) => i.stage === 'declined');
  const talking = open.filter((i) => !i.stage || i.stage === 'talking');
  const parts = [
    talking.length ? `${talking.length} talking` : null,
    proposalSent.length ? `${proposalSent.length} proposal${proposalSent.length === 1 ? '' : 's'} out` : null,
    declined.length ? `${declined.length} declined` : null,
    active.length ? `${active.length} active plan${active.length === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  return {
    talking,
    proposalSent,
    declined,
    active,
    completed,
    openCount: talking.length + proposalSent.length + declined.length + active.length,
    needsYou: talking.length + declined.length,
    summary: parts.join(' · '),
  };
}
