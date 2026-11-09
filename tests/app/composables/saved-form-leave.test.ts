import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Leaving the page from the page itself — signing out — asks the guards a
 * form or a modal registered, and the answer decides whether closing the
 * tab afterwards asks again. The composable's Vue hooks and the browser's
 * window are stood in for: a guard mounts at once, and `beforeunload` is
 * dispatched by hand.
 */

let unloadListeners: ((event: { preventDefault(): void }) => void)[];
let confirm: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  unloadListeners = [];
  confirm = vi.fn(() => true);
  vi.stubGlobal('window', {
    confirm,
    addEventListener: (type: string, listener: never) => {
      if (type === 'beforeunload') unloadListeners.push(listener);
    },
    removeEventListener: () => {},
  });
  vi.stubGlobal('phrase', { value: { unsaved_changes_confirm: 'Leave?' } });
  vi.stubGlobal('onMounted', (callback: () => void) => callback());
  vi.stubGlobal('onUnmounted', () => {});
});

afterEach(() => vi.unstubAllGlobals());

/** Whether closing the tab now would ask. */
function closingAsks() {
  const preventDefault = vi.fn();
  for (const listener of unloadListeners) listener({ preventDefault });
  return preventDefault.mock.calls.length > 0;
}

async function withUnsavedForm() {
  const form = await import('../../../app/composables/saved-form');
  form.useBeforeUnloadGuard(() => true);
  return form;
}

describe('leavePage', () => {
  it('asks first, and «Cancel» changes nothing', async () => {
    const { leavePage } = await withUnsavedForm();
    confirm.mockReturnValue(false);
    const steps = vi.fn(async () => {});
    await leavePage(steps);
    expect(confirm).toHaveBeenCalledWith('Leave?');
    expect(steps).not.toHaveBeenCalled();
    expect(closingAsks()).toBe(true);
  });

  it('agreed and gone through, closing the tab asks nothing more', async () => {
    const { leavePage } = await withUnsavedForm();
    await leavePage(async () => {});
    expect(closingAsks()).toBe(false);
  });

  it('forgets the agreement when the owner stops on the way', async () => {
    const { leavePage } = await withUnsavedForm();
    await leavePage(async () => false);
    expect(closingAsks()).toBe(true);
  });

  it('forgets the agreement when a step fails, and says why', async () => {
    const { leavePage } = await withUnsavedForm();
    await expect(
      leavePage(async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
    expect(closingAsks()).toBe(true);
  });

  it('asks nothing when no guard would lose anything', async () => {
    const { leavePage, useBeforeUnloadGuard } =
      await import('../../../app/composables/saved-form');
    useBeforeUnloadGuard(() => false);
    const steps = vi.fn(async () => {});
    await leavePage(steps);
    expect(confirm).not.toHaveBeenCalled();
    expect(steps).toHaveBeenCalledOnce();
  });
});
