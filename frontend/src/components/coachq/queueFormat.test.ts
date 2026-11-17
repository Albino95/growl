import { describe, expect, it } from 'vitest';
import {
  clientsFor,
  contactLabel,
  defaultSegment,
  formatMinutes,
  progressLabel,
  weekStats,
} from './queueFormat';
import type { CoachQueue, QueueClient } from '../../services/api/coachq';

const week = {
  days_checked_in: null,
  mood_avg: null,
  mood_trend: null,
  yes_rate: null,
  proofs: 0,
  homework_done: 0,
  homework_overdue: 0,
};
const client = (id: string, status: QueueClient['status'], wins = 0): QueueClient => ({
  contract_id: id,
  client: { id, username: id, display_name: null, avatar_url: null },
  status,
  reasons: [],
  wins: Array.from({ length: wins }, () => ({ code: 'streak', label: '7-day streak' })),
  week,
  last_contact_at: null,
  handled_until: null,
});
const queue = (clients: QueueClient[]): CoachQueue => ({
  generated_at: '',
  counts: { red: 0, amber: 0, green: 0, wins: 0 },
  clients,
});

describe('queueFormat', () => {
  it('segments clients and picks the first non-empty segment', () => {
    const q = queue([client('a', 'green', 1), client('b', 'amber')]);
    expect(clientsFor(q, 'wins').map((c) => c.contract_id)).toEqual(['a']);
    expect(clientsFor(q, 'red')).toEqual([]);
    expect(defaultSegment(q)).toBe('amber');
    expect(defaultSegment(queue([]))).toBe('red');
    expect(defaultSegment(null)).toBe('red');
  });

  it('formats review time', () => {
    expect(formatMinutes(0)).toBe('~5 min');
    expect(formatMinutes(42)).toBe('~40 min');
    expect(formatMinutes(120)).toBe('~2 h');
    expect(formatMinutes(93)).toBe('~1 h 35 min');
  });

  it('shows only shared week stats', () => {
    expect(weekStats(week)).toEqual([]);
    const s = weekStats({ ...week, days_checked_in: 5, mood_avg: 3.4, mood_trend: 'down', yes_rate: 0.5, proofs: 1 });
    expect(s.map((x) => x.label)).toEqual(['5/7 days', 'Mood 3.4 ↓', '50% follow-through', '1 proof']);
  });

  it('labels contact and progress', () => {
    const now = new Date('2026-11-17T12:00:00Z');
    expect(contactLabel(null, now)).toBe('No contact yet');
    expect(contactLabel('2026-11-17T08:00:00Z', now)).toBe('Last contact today');
    expect(contactLabel('2026-11-16T08:00:00Z', now)).toBe('Last contact yesterday');
    expect(contactLabel('2026-11-10T08:00:00Z', now)).toBe('Last contact 7 days ago');
    expect(progressLabel(3, 12)).toBe('4 of 12');
    expect(progressLabel(0, 0)).toBe('');
  });
});
