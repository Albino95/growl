import { describe, it, expect } from 'vitest';
import {
  coachShareCaption,
  homeworkNoteForProof,
  isCohortAssignmentId,
  realHomeworkNote,
} from './proofDefaults';

describe('homework notes around proofs', () => {
  const number = { kind: 'number' as const, number: 25, unit: 'reps' };
  const note = { kind: 'note' as const, text: 'Ran in the rain' };

  it('keeps the note the client typed, never the proof summary', () => {
    expect(homeworkNoteForProof('  Felt strong today ')).toBe('Felt strong today');
    expect(homeworkNoteForProof('')).toBeUndefined();
    expect(homeworkNoteForProof(null)).toBeUndefined();
    expect(homeworkNoteForProof('x'.repeat(600))).toHaveLength(500);
  });

  it('hides a note that only repeats the proof value', () => {
    expect(realHomeworkNote('25 reps', [number])).toBeNull();
    expect(realHomeworkNote('“Ran in the rain”', [note])).toBeNull();
    expect(realHomeworkNote('Ran in the rain', [note])).toBeNull();
    expect(realHomeworkNote('Done with proof', [])).toBeNull();
    expect(realHomeworkNote('   ', [number])).toBeNull();
    expect(realHomeworkNote(null, [number])).toBeNull();
  });

  it('shows a real note', () => {
    expect(realHomeworkNote('Last set was hard', [number])).toBe('Last set was hard');
    expect(realHomeworkNote(' Felt good ', null)).toBe('Felt good');
  });
});

describe('coach share caption', () => {
  it('detects group homework ids', () => {
    expect(isCohortAssignmentId('cohort_asg_abc123')).toBe(true);
    expect(isCohortAssignmentId('asg_abc123')).toBe(false);
    expect(isCohortAssignmentId('')).toBe(false);
    expect(isCohortAssignmentId(undefined)).toBe(false);
  });

  it('uses group wording for cohort homework', () => {
    expect(coachShareCaption(true)).toBe('Only your group’s coach sees it.');
    expect(coachShareCaption(false)).toBe('Only your coach sees it, while your plan is active.');
  });
});
