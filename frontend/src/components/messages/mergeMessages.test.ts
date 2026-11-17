import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../services/api/messages';
import { confirmSentMessage, mergeMessages } from './mergeMessages';

const msg = (id: string, sec: number, body = id): ChatMessage => ({
  id,
  conversation_id: 'c',
  sender_id: 'u',
  body,
  created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, sec)).toISOString(),
  is_own: true,
});

describe('mergeMessages', () => {
  it('keeps temp/failed sends that the server does not have yet', () => {
    const local = [msg('a', 1), msg('temp-1', 5), msg('temp-2', 6)];
    const server = [msg('a', 1), msg('b', 3)];
    expect(mergeMessages(local, server).map((m) => m.id)).toEqual(['a', 'b', 'temp-1', 'temp-2']);
  });

  it('keeps older pages loaded earlier and prefers server copies', () => {
    const local = [msg('old1', 0), msg('a', 1, 'stale')];
    const server = [msg('a', 1, 'fresh'), msg('b', 2)];
    const merged = mergeMessages(local, server);
    expect(merged.map((m) => m.id)).toEqual(['old1', 'a', 'b']);
    expect(merged[1].body).toBe('fresh');
  });

  it('never duplicates ids', () => {
    const merged = mergeMessages([msg('a', 1), msg('a', 1)], [msg('a', 1)]);
    expect(merged).toHaveLength(1);
  });
});

describe('confirmSentMessage', () => {
  it('swaps the temp for the saved message', () => {
    const out = confirmSentMessage([msg('a', 1), msg('temp-1', 2)], 'temp-1', msg('m9', 2));
    expect(out.map((m) => m.id)).toEqual(['a', 'm9']);
  });

  it('drops the temp when a poll already delivered the saved message', () => {
    const out = confirmSentMessage([msg('m9', 2), msg('temp-1', 2)], 'temp-1', msg('m9', 2));
    expect(out.map((m) => m.id)).toEqual(['m9']);
  });
});
