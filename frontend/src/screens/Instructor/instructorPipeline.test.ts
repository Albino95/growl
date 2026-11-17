import { describe, it, expect } from 'vitest';
import { onboardingSteps, pipelineGroups } from './instructorPipeline';
import type { CoachingContract, CoachingInquiry } from '../../services/api/instructor';

const inq = (id: string, client: string, stage?: CoachingInquiry['stage'], status = 'talking') =>
  ({ id, client_id: client, instructor_id: 'me', status, stage }) as CoachingInquiry;
const con = (id: string, client: string, status: string) =>
  ({ id, client_id: client, instructor_id: 'me', status }) as CoachingContract;

describe('pipelineGroups', () => {
  it('groups by stage and hides inquiries for clients with an active plan', () => {
    const g = pipelineGroups(
      [
        inq('1', 'a', 'talking'),
        inq('2', 'b', 'proposal_sent'),
        inq('3', 'c', 'declined'),
        inq('4', 'd', 'active'),
        inq('5', 'e'),
        inq('6', 'f', 'talking'),
        inq('7', 'g', 'closed', 'closed'),
      ],
      [con('k1', 'd', 'active'), con('k2', 'f', 'active'), con('k3', 'z', 'completed')]
    );
    expect(g.talking.map((i) => i.id)).toEqual(['1', '5']);
    expect(g.proposalSent.map((i) => i.id)).toEqual(['2']);
    expect(g.declined.map((i) => i.id)).toEqual(['3']);
    expect(g.active).toHaveLength(2);
    expect(g.completed).toHaveLength(1);
    expect(g.openCount).toBe(6);
    expect(g.needsYou).toBe(3);
    expect(g.summary).toBe('2 talking · 1 proposal out · 1 declined · 2 active plans');
  });

  it('is empty-safe', () => {
    const g = pipelineGroups([], []);
    expect(g.openCount).toBe(0);
    expect(g.summary).toBe('');
  });
});

describe('onboardingSteps', () => {
  const base = {
    alreadyInstructor: false,
    endorsementsReceived: 1,
    endorsementsNeeded: 3,
    postCount: 5,
    postsNeeded: 3,
    eligible: false,
    canClaim: false,
  };

  it('marks exactly one current step: the first not done', () => {
    const s = onboardingSteps(base);
    expect(s.map((x) => x.done)).toEqual([false, true, false, false]);
    expect(s.filter((x) => x.current).map((x) => x.key)).toEqual(['endorse']);
    expect(s[0].detail).toBe('1 of 3');
  });

  it('moves to claim when ready, and to offer once claimed', () => {
    const ready = onboardingSteps({ ...base, endorsementsReceived: 3, canClaim: true, eligible: true });
    expect(ready.find((x) => x.current)?.key).toBe('claim');
    const claimed = onboardingSteps({ ...base, alreadyInstructor: true });
    expect(claimed.find((x) => x.current)?.key).toBe('offer');
  });
});
