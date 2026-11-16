import { describe, expect, it, vi } from 'vitest';
import { subscribeKeyboardInset, type KeyboardFrameEvent, type KeyboardLike } from './keyboardInsetCore';

function fakeKeyboard() {
  const listeners: Record<string, ((e: KeyboardFrameEvent) => void)[]> = {};
  const removed: string[] = [];
  const keyboard: KeyboardLike = {
    addListener: (event, cb) => {
      (listeners[event] ||= []).push(cb);
      return {
        remove: () => {
          removed.push(event);
          listeners[event] = (listeners[event] || []).filter((l) => l !== cb);
        },
      };
    },
  };
  const emit = (event: string, e: KeyboardFrameEvent) => (listeners[event] || []).forEach((l) => l(e));
  return { keyboard, emit, removed, listeners };
}

/** A node whose window frame is (y, h); measureInWindow answers synchronously. */
const node = (y: number, h: number) => ({
  measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, y, 390, h),
});

describe('subscribeKeyboardInset', () => {
  it('reports the overlap between the wrapper bottom and the keyboard top (screen coords)', () => {
    const { keyboard, emit } = fakeKeyboard();
    const onInset = vi.fn();
    // Full-screen wrapper on an 844pt screen; keyboard top at 508 → 336 overlap.
    subscribeKeyboardInset({ keyboard, getNode: () => node(0, 844), onInset });
    emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 508 }, duration: 250 });
    expect(onInset).toHaveBeenCalledWith(336, 250);
  });

  it('is correct inside a pageSheet (wrapper offset from the window top)', () => {
    const { keyboard, emit } = fakeKeyboard();
    const onInset = vi.fn();
    // pageSheet starts ~59pt down and ends at the screen bottom.
    subscribeKeyboardInset({ keyboard, getNode: () => node(59, 785), onInset });
    emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 508 } });
    expect(onInset).toHaveBeenCalledWith(336, undefined);
  });

  it('clamps to 0 when the keyboard does not reach the wrapper and rounds fractions', () => {
    const { keyboard, emit } = fakeKeyboard();
    const onInset = vi.fn();
    let n = node(0, 400.4);
    subscribeKeyboardInset({ keyboard, getNode: () => n, onInset });
    emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 508 } });
    expect(onInset).not.toHaveBeenCalled(); // 0 → unchanged
    n = node(0, 600.6);
    emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 508 } });
    expect(onInset).toHaveBeenLastCalledWith(93, undefined);
  });

  it('dedupes identical values and resets to 0 on hide', () => {
    const { keyboard, emit } = fakeKeyboard();
    const onInset = vi.fn();
    subscribeKeyboardInset({ keyboard, getNode: () => node(0, 844), onInset });
    emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 508 } });
    emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 508 } });
    expect(onInset).toHaveBeenCalledTimes(1);
    emit('keyboardWillHide', { endCoordinates: { screenY: 844 }, duration: 200 });
    expect(onInset).toHaveBeenLastCalledWith(0, 200);
    expect(onInset).toHaveBeenCalledTimes(2);
  });

  it('ignores events with no mounted node or non-finite measurements', () => {
    const { keyboard, emit } = fakeKeyboard();
    const onInset = vi.fn();
    let n: ReturnType<typeof node> | null = null;
    subscribeKeyboardInset({ keyboard, getNode: () => n, onInset });
    emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 508 } });
    n = node(Number.NaN, 844);
    emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 508 } });
    expect(onInset).not.toHaveBeenCalled();
  });

  it('removes both listeners and stops reporting after unsubscribe', () => {
    const { keyboard, emit, removed } = fakeKeyboard();
    const onInset = vi.fn();
    let deferred: (() => void) | null = null;
    const lateNode = {
      measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => {
        deferred = () => cb(0, 0, 390, 844);
      },
    };
    const unsubscribe = subscribeKeyboardInset({ keyboard, getNode: () => lateNode, onInset });
    emit('keyboardWillChangeFrame', { endCoordinates: { screenY: 508 } });
    unsubscribe();
    deferred!(); // measurement resolving after unmount must not set state
    expect(onInset).not.toHaveBeenCalled();
    expect(removed.sort()).toEqual(['keyboardWillChangeFrame', 'keyboardWillHide']);
  });
});
