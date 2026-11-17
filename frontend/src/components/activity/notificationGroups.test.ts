import { describe, it, expect } from 'vitest';
import {
  dayBucket,
  groupNotifications,
  groupedTitle,
  serverTime,
  timeAgo,
} from './notificationGroups';
import type { ActivityNotification } from '../../services/api/notifications';

function n(
  id: string,
  created_at: string,
  over: Partial<ActivityNotification> = {}
): ActivityNotification {
  return {
    id,
    type: 'post_like',
    title: `${id} liked your post`,
    body: null,
    ref_type: 'post',
    ref_id: 'p1',
    read_at: null,
    created_at,
    unread: false,
    actor: { id: `u_${id}`, username: id, avatar: null },
    ...over,
  };
}

// Local noon so the day maths is timezone-independent.
const NOW = new Date(2026, 10, 15, 12, 0, 0);
const at = (daysAgo: number, hour = 10) => new Date(2026, 10, 15 - daysAgo, hour, 0, 0).toISOString();

describe('serverTime / timeAgo', () => {
  it('parses SQLite UTC timestamps (no zone) as UTC', () => {
    expect(serverTime('2026-11-15 10:00:00')).toBe(Date.UTC(2026, 10, 15, 10, 0, 0));
    expect(serverTime('garbage')).toBe(0);
    expect(serverTime(null)).toBe(0);
  });
  it('formats compact ages', () => {
    const now = Date.UTC(2026, 10, 15, 12, 0, 0);
    expect(timeAgo('2026-11-15 11:59:30', now)).toBe('now');
    expect(timeAgo('2026-11-15 11:00:00', now)).toBe('1h');
    expect(timeAgo('2026-11-13 12:00:00', now)).toBe('2d');
    expect(timeAgo('2026-10-25 12:00:00', now)).toBe('3w');
    expect(timeAgo('', now)).toBe('');
  });
});

describe('dayBucket', () => {
  it('uses local calendar days', () => {
    expect(dayBucket(at(0, 1), NOW)).toBe('Today');
    expect(dayBucket(at(1, 23), NOW)).toBe('Yesterday');
    expect(dayBucket(at(4), NOW)).toBe('This week');
    expect(dayBucket(at(9), NOW)).toBe('Earlier');
  });
});

describe('groupedTitle', () => {
  it('names one, two, or "N others"', () => {
    expect(groupedTitle(['ann'], 'post_like')).toBe('ann liked your post');
    expect(groupedTitle(['ann', 'bob'], 'post_like')).toBe('ann and bob liked your post');
    expect(groupedTitle(['ann', 'bob', 'cy'], 'post_like')).toBe('ann and 2 others liked your post');
    expect(groupedTitle(['ann', 'bob', 'cy', 'di'], 'post_like')).toBe('ann and 3 others liked your post');
  });
});

describe('groupNotifications', () => {
  it('folds likes on the same post within a day; keeps other types and other posts apart', () => {
    const items = [
      n('ann', at(0, 11), { unread: true }),
      n('bob', at(0, 10)),
      n('cy', at(0, 9)),
      n('dee', at(0, 8), { ref_id: 'p2', title: 'dee liked your post' }),
      n('eve', at(0, 7), { type: 'post_comment', title: 'eve commented' }),
      n('fay', at(1, 10)),
    ];
    const sections = groupNotifications(items, NOW);
    expect(sections.map((s) => s.title)).toEqual(['Today', 'Yesterday']);
    const today = sections[0].data;
    expect(today.map((r) => r.key)).toEqual(['ann', 'dee', 'eve']);
    expect(today[0].title).toBe('ann and 2 others liked your post');
    expect(today[0].others).toBe(2);
    expect(today[0].unread).toBe(true);
    expect(today[0].members.map((m) => m.id)).toEqual(['ann', 'bob', 'cy']);
    expect(today[1].title).toBe('dee liked your post');
    expect(sections[1].data[0].title).toBe('fay liked your post');
  });

  it('counts the same person once', () => {
    const items = [n('ann', at(0, 11)), n('ann2', at(0, 10), { actor: { id: 'u_ann', username: 'ann', avatar: null } })];
    const [row] = groupNotifications(items, NOW)[0].data;
    expect(row.members).toHaveLength(2);
    expect(row.others).toBe(0);
    expect(row.title).toBe('ann liked your post');
  });

  it('returns no sections for an empty list', () => {
    expect(groupNotifications([], NOW)).toEqual([]);
  });
});
