import { describe, expect, it } from 'vitest';
import { parsePendingWidgetCheckin, parseWidgetUrl, WIDGET_PENDING_MAX_AGE_MS } from './widgetUrl';
import { isWidgetStorageAvailable, widgetStorageGet } from './widgetStorage';

describe('parseWidgetUrl', () => {
  it('home', () => {
    expect(parseWidgetUrl('growl://home')).toEqual({ kind: 'home' });
    expect(parseWidgetUrl('growl://home/')).toEqual({ kind: 'home' });
    expect(parseWidgetUrl('GROWL://Home')).toEqual({ kind: 'home' });
  });

  it('checkin with each mood key', () => {
    expect(parseWidgetUrl('growl://checkin?mood=heavy')).toEqual({ kind: 'checkin', mood: 1 });
    expect(parseWidgetUrl('growl://checkin?mood=tired')).toEqual({ kind: 'checkin', mood: 2 });
    expect(parseWidgetUrl('growl://checkin?mood=okay')).toEqual({ kind: 'checkin', mood: 3 });
    expect(parseWidgetUrl('growl://checkin?mood=good')).toEqual({ kind: 'checkin', mood: 4 });
    expect(parseWidgetUrl('growl://checkin?mood=bright')).toEqual({ kind: 'checkin', mood: 5 });
  });

  it('accepts numeric moods, extra params, fragments, encoding', () => {
    expect(parseWidgetUrl('growl://checkin?mood=3')).toEqual({ kind: 'checkin', mood: 3 });
    expect(parseWidgetUrl('growl://checkin/?src=widget&mood=Good#x')).toEqual({ kind: 'checkin', mood: 4 });
    expect(parseWidgetUrl('growl://checkin?mood=%20bright')).toEqual({ kind: 'checkin', mood: 5 });
  });

  it('checkin without / with an unknown mood just opens Home', () => {
    expect(parseWidgetUrl('growl://checkin')).toEqual({ kind: 'checkin', mood: null });
    expect(parseWidgetUrl('growl://checkin?mood=meh')).toEqual({ kind: 'checkin', mood: null });
    expect(parseWidgetUrl('growl://checkin?mood=9')).toEqual({ kind: 'checkin', mood: null });
    expect(parseWidgetUrl('growl://checkin?mood=%E0%A4%A')).toEqual({ kind: 'checkin', mood: null });
  });

  it('ignores everything else', () => {
    expect(parseWidgetUrl(null)).toBeNull();
    expect(parseWidgetUrl('')).toBeNull();
    expect(parseWidgetUrl('growl://checkout/success')).toBeNull();
    expect(parseWidgetUrl('growl://checkins')).toBeNull();
    expect(parseWidgetUrl('growl://invite/ABC')).toBeNull();
    expect(parseWidgetUrl('https://letsgrow.lu/checkin?mood=good')).toBeNull();
    expect(parseWidgetUrl('growl://homework')).toBeNull();
  });
});

describe('parsePendingWidgetCheckin', () => {
  const now = 1_800_000_000_000;
  const raw = (url: unknown, at: unknown) => JSON.stringify({ url, at });

  it('returns a recent checkin URL', () => {
    expect(parsePendingWidgetCheckin(raw('growl://checkin?mood=good', now - 5000), now)).toBe(
      'growl://checkin?mood=good'
    );
  });

  it('drops stale, future, malformed or non-checkin payloads', () => {
    expect(parsePendingWidgetCheckin(raw('growl://checkin?mood=good', now - WIDGET_PENDING_MAX_AGE_MS - 1), now)).toBeNull();
    expect(parsePendingWidgetCheckin(raw('growl://checkin?mood=good', now + 5 * 60_000), now)).toBeNull();
    expect(parsePendingWidgetCheckin(raw('growl://home', now), now)).toBeNull();
    expect(parsePendingWidgetCheckin(raw(42, now), now)).toBeNull();
    expect(parsePendingWidgetCheckin(raw('growl://checkin?mood=good', 'x'), now)).toBeNull();
    expect(parsePendingWidgetCheckin('{not json', now)).toBeNull();
    expect(parsePendingWidgetCheckin(null, now)).toBeNull();
  });
});

describe('widgetStorage without the native module', () => {
  it('is a safe no-op (tests / Expo Go)', () => {
    expect(isWidgetStorageAvailable()).toBe(false);
    expect(widgetStorageGet('grow.widget.today')).toBeNull();
  });
});
