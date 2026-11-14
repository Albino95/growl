import { describe, expect, it } from 'vitest';
import { clipEndMs, isAtClipEnd, playFromMs } from './editorPlayback';

describe('editorPlayback', () => {
  it('treats trimEnd 0 as the full clip', () => {
    expect(clipEndMs(0, 8000)).toBe(8000);
    expect(clipEndMs(3000, 8000)).toBe(3000);
    expect(clipEndMs(9000, 8000)).toBe(8000);
  });

  it('detects the last frames so Play can restart', () => {
    expect(isAtClipEnd(8000, 8000)).toBe(true);
    expect(isAtClipEnd(7900, 8000)).toBe(true);
    expect(isAtClipEnd(4000, 8000)).toBe(false);
    expect(isAtClipEnd(0, 8000)).toBe(false);
  });

  it('replays from IN when the clip has ended', () => {
    expect(playFromMs(8000, 0, 8000)).toBe(0);
    expect(playFromMs(5200, 1200, 5000)).toBe(1200);
    expect(playFromMs(2000, 1200, 5000)).toBe(2000);
  });
});
