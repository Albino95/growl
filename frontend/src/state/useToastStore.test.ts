import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useToastStore,
  toast,
  TOAST_DURATION_MS,
  TOAST_ACTION_DURATION_MS,
} from './useToastStore';

describe('useToastStore', () => {
  beforeEach(() => {
    useToastStore.setState({ current: null });
  });

  it('shows a success toast with the default duration', () => {
    const id = toast.success('Profile saved');
    const cur = useToastStore.getState().current;
    expect(cur).not.toBeNull();
    expect(cur?.id).toBe(id);
    expect(cur?.message).toBe('Profile saved');
    expect(cur?.tone).toBe('success');
    expect(cur?.durationMs).toBe(TOAST_DURATION_MS);
  });

  it('info tone + action uses the longer duration', () => {
    const onPress = vi.fn();
    toast.info('Removed', { action: { label: 'Undo', onPress } });
    const cur = useToastStore.getState().current;
    expect(cur?.tone).toBe('info');
    expect(cur?.action?.label).toBe('Undo');
    expect(cur?.durationMs).toBe(TOAST_ACTION_DURATION_MS);
  });

  it('new toast replaces the old one (one at a time)', () => {
    const a = toast.success('First');
    const b = toast.success('Second');
    expect(b).not.toBe(a);
    expect(useToastStore.getState().current?.message).toBe('Second');
  });

  it('hide(id) ignores stale ids, hide() always hides', () => {
    const a = toast.success('First');
    const b = toast.success('Second');
    toast.hide(a);
    expect(useToastStore.getState().current?.id).toBe(b);
    toast.hide(b);
    expect(useToastStore.getState().current).toBeNull();
    toast.success('Third');
    toast.hide();
    expect(useToastStore.getState().current).toBeNull();
  });

  it('ignores empty messages', () => {
    expect(toast.success('   ')).toBe(0);
    expect(useToastStore.getState().current).toBeNull();
  });

  it('defaults tone to success via show()', () => {
    useToastStore.getState().show({ message: 'Copied' });
    expect(useToastStore.getState().current?.tone).toBe('success');
  });
});
