import { describe, expect, it, vi } from 'vitest';
import { subscribeKeyboardInset, type KeyboardFrameEvent } from './keyboardInsetCore';

function fakeKeyboard() {
  const listeners: Record<string, ((e: KeyboardFrameEvent) => void)[]> = {};
  const removed: string[] = [];
  return {
    removed,
    emit(event: 'keyboardWillChangeFrame' | 'keyboardWillHide', e: KeyboardFrameEvent) {
      (listeners[event] || []).forEach((cb) => cb(e));
    },
    addListener(event: 'keyboardWillChangeFrame' | 'keyboardWillHide', cb: (e: KeyboardFrameEvent) => void) {
      (listeners[event] ||= []).push(cb);
      return {
        remove: () => {
          removed.push(event);
          listeners[event] = (listeners[event] || []).filter((x) => x !== cb);
        },
      };
    },
  };
}

const SCREEN = 852; // iPhone 15/16 points

describe('subscribeKeyboardInset', () => {
  it('reports the keyboard height for a bottom-anchored wrapper', () => {
    const kb = fakeKeyboard();
    const onInset = vi.fn();
    subscribeKeyboardInset({ keyboard: kb, onInset, screenHeight: SCREEN });
    kb.emit('keyboardWillChangeFrame', { endCoordinates: { screenY: SCREEN - 336, height: 336 }, duration: 250 });
    expect(onInset).toHaveBeenLastCalledWith(336, 250);
  });

  it('does not depend on view coordinates (pageSheet / modal surfaces)', () => {
    const kb = fakeKeyboard();
    const onInset = vi.fn();
    // A node whose measureInWindow would report sheet-relative coords must not matter.
    const getNode = () => ({ measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, 0, 390, 790) });
    subscribeKeyboardInset({ keyboard: kb, onInset, screenHeight: SCREEN, getNode });
    kb.emit('keyboardWillChangeFrame', { endCoordinates: { screenY: SCREEN - 380, height: 380 } });
    expect(onInset).toHaveBeenLastCalledWith(380, undefined);
  });

  it('resets to 0 when the keyboard moves off-screen or hides, and dedupes', () => {
    const kb = fakeKeyboard();
    const onInset = vi.fn();
    subscribeKeyboardInset({ keyboard: kb, onInset, screenHeight: SCREEN });
    kb.emit('keyboardWillChangeFrame', { endCoordinates: { screenY: SCREEN - 300, height: 300 } });
    kb.emit('keyboardWillChangeFrame', { endCoordinates: { screenY: SCREEN - 300, height: 300 } });
    kb.emit('keyboardWillChangeFrame', { endCoordinates: { screenY: SCREEN, height: 300 } });
    kb.emit('keyboardWillHide', { endCoordinates: { screenY: SCREEN, height: 0 } });
    expect(onInset.mock.calls.map((c) => c[0])).toEqual([300, 0]);
  });

  it('handles Prefer Cross-Fade Transitions (screenY 0) and rounds', () => {
    const kb = fakeKeyboard();
    const onInset = vi.fn();
    subscribeKeyboardInset({ keyboard: kb, onInset, screenHeight: SCREEN });
    kb.emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 0, height: 335.6 } });
    expect(onInset).toHaveBeenLastCalledWith(336, undefined);
  });

  it('removes both listeners and stops reporting after unsubscribe', () => {
    const kb = fakeKeyboard();
    const onInset = vi.fn();
    const off = subscribeKeyboardInset({ keyboard: kb, onInset, screenHeight: SCREEN });
    off();
    kb.emit('keyboardWillChangeFrame', { endCoordinates: { screenY: SCREEN - 300, height: 300 } });
    expect(onInset).not.toHaveBeenCalled();
    expect(kb.removed.sort()).toEqual(['keyboardWillChangeFrame', 'keyboardWillHide']);
  });
});
