import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { defineComponent, nextTick, type Component } from 'vue';
import {
  closeModal,
  dismissOneStep,
  installModalNavigationInterceptor,
  interceptModalNavigation,
  modalHistorySettled,
  modalStack,
  openModal,
  registerDismissLayer,
  runModalFlow,
  settleModal,
} from '../../../app/composables/modal';
import type { ModalDescriptor } from '../../../app/modals/types';

type TestModalResult = { type: 'done'; value: number } | { type: 'empty' };
const TestComponent = defineComponent({});
const testModal: ModalDescriptor<TestModalResult, Component> = {
  name: 'test',
  component: () => Promise.resolve({ default: TestComponent }),
};

beforeEach(() => {
  modalStack.value = [];
});

// A leaked interceptor keeps watching the stack with a window that afterEach
// has already unstubbed, which turns one failure into a cascade of them.
const installed: (() => void)[] = [];

afterEach(() => {
  while (installed.length) installed.pop()!();
  vi.unstubAllGlobals();
});

function installInterceptor(router: unknown) {
  const uninstall = installModalNavigationInterceptor(router as never);
  installed.push(uninstall);
  return uninstall;
}

/** A window whose history can be inspected and whose Back can be replayed. */
function stubWindow(href = 'http://localhost/admin/projects/project/edit/') {
  let popState: (() => void) | undefined;
  const history = {
    state: {} as Record<string, unknown>,
    pushState: vi.fn((state: object) => {
      history.state = state as Record<string, unknown>;
    }),
    back: vi.fn(),
  };
  vi.stubGlobal('window', {
    history,
    location: { href },
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'popstate') popState = listener;
    },
    removeEventListener: vi.fn(),
  });
  return {
    history,
    /** Replay a popstate, after the browser restored the previous state. */
    pop() {
      history.state = {};
      popState?.();
    },
  };
}

/**
 * A router that hands back the guard it was given.
 *
 * The other tests stub `beforeEach` as a bare spy, so the guard body never
 * runs and everything it does to the stack stays invisible.
 */
function stubRouter() {
  const removeGuard = vi.fn();
  let guard: ((to: unknown, from: unknown) => unknown) | undefined;
  let afterHook: (() => void) | undefined;
  const router = {
    beforeEach: vi.fn((fn: (to: unknown, from: unknown) => unknown) => {
      guard = fn;
      return removeGuard;
    }),
    afterEach: vi.fn((fn: () => void) => {
      afterHook = fn;
      return vi.fn();
    }),
  };
  return {
    router,
    removeGuard,
    navigate: (toPath: string, fromPath: string) =>
      guard!({ fullPath: toPath }, { fullPath: fromPath }),
    /** Finish the navigation the router runs after a popstate. */
    afterNavigation: () => afterHook?.(),
  };
}

test('settling the top modal keeps its parent alive', async () => {
  const parentResult = openModal(testModal);
  await Promise.resolve();
  const parent = modalStack.value[0]!;
  const childResult = openModal(testModal);
  await Promise.resolve();
  settleModal(modalStack.value[1]!, { type: 'done', value: 2 });
  await expect(childResult).resolves.toEqual({ type: 'done', value: 2 });
  expect(modalStack.value).toEqual([parent]);
  settleModal(parent, { type: 'done', value: 1 });
  await parentResult;
});

test('closeModal removes only the top modal and restores focus', async () => {
  const parentResult = openModal(testModal);
  await Promise.resolve();
  const parent = modalStack.value[0]!;
  const childResult = openModal(testModal);
  await Promise.resolve();
  const focus = vi.fn();
  modalStack.value[1]!.returnFocus = { isConnected: true, focus };
  expect(closeModal()).toBe(true);
  await expect(childResult).resolves.toEqual({ type: 'empty' });
  await nextTick();
  expect(modalStack.value).toEqual([parent]);
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  settleModal(parent, { type: 'done', value: 1 });
  await parentResult;
});

test('close guard blocks only the active modal', async () => {
  const result = openModal(testModal);
  await Promise.resolve();
  const modal = modalStack.value[0]!;
  modal.closeGuard = () => false;
  expect(closeModal()).toBe(false);
  expect(modalStack.value).toEqual([modal]);
  modal.closeGuard = () => true;
  expect(closeModal()).toBe(true);
  await expect(result).resolves.toEqual({ type: 'empty' });
});

test('route navigation closes only the top modal', async () => {
  const parentResult = openModal(testModal);
  await Promise.resolve();
  const parent = modalStack.value[0]!;
  const childResult = openModal(testModal);
  await Promise.resolve();

  expect(interceptModalNavigation()).toBe(true);
  await Promise.resolve();
  await expect(childResult).resolves.toEqual({ type: 'empty' });
  expect(modalStack.value).toEqual([parent]);

  settleModal(parent, { type: 'done', value: 1 });
  await parentResult;
});

test('route navigation stays handled when the modal close guard blocks', async () => {
  const result = openModal(testModal);
  await Promise.resolve();
  const modal = modalStack.value[0]!;
  modal.closeGuard = () => false;

  expect(interceptModalNavigation()).toBe(true);
  await Promise.resolve();
  expect(modalStack.value).toEqual([modal]);

  modal.closeGuard = () => true;
  expect(closeModal()).toBe(true);
  await expect(result).resolves.toEqual({ type: 'empty' });
});

test('route navigation is not consumed without an active modal', () => {
  expect(interceptModalNavigation()).toBe(false);
});

test('browser Back closes nested modals one at a time without changing URL', async () => {
  let popState: (() => void) | undefined;
  const pushState = vi.fn((state: object) => {
    history.state = state;
  });
  const back = vi.fn();
  const history = { state: {}, pushState, back };
  vi.stubGlobal('window', {
    history,
    location: { href: 'http://localhost/admin/projects/project/edit/' },
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'popstate') popState = listener;
    },
    removeEventListener: vi.fn(),
  });
  const removeGuard = vi.fn();
  const router = {
    beforeEach: vi.fn(() => removeGuard),
    afterEach: vi.fn(() => vi.fn()),
  };
  const uninstall = installInterceptor(router);

  const parentResult = openModal(testModal);
  await Promise.resolve();
  const parent = modalStack.value[0]!;
  const childResult = openModal(testModal);
  await Promise.resolve();
  expect(pushState).toHaveBeenCalledTimes(1);

  history.state = {};
  popState?.();
  await Promise.resolve();
  await expect(childResult).resolves.toEqual({ type: 'empty' });
  expect(modalStack.value).toEqual([parent]);
  expect(pushState).toHaveBeenCalledTimes(2);
  expect(window.location.href).toBe(
    'http://localhost/admin/projects/project/edit/',
  );

  history.state = {};
  popState?.();
  await Promise.resolve();
  await expect(parentResult).resolves.toEqual({ type: 'empty' });
  expect(modalStack.value).toEqual([]);
  expect(back).not.toHaveBeenCalled();
  uninstall();
  expect(removeGuard).toHaveBeenCalledOnce();
});

test('waits for the leave transition and deduplicates repeated closes', async () => {
  const result = openModal(testModal);
  await Promise.resolve();
  const modal = modalStack.value[0]!;
  let finish!: () => void;
  const transition = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  modal.leaveTransition = transition;
  expect(closeModal()).toBe(true);
  expect(closeModal()).toBe(true);
  expect(transition).toHaveBeenCalledOnce();
  expect(modalStack.value).toEqual([modal]);
  finish();
  await expect(result).resolves.toEqual({ type: 'empty' });
  expect(modalStack.value).toEqual([]);
});

test('browser Back waits for an animated modal without pushing another sentinel', async () => {
  let popState: (() => void) | undefined;
  const history = {
    state: {} as object,
    pushState: vi.fn((state: object) => {
      history.state = state;
    }),
    back: vi.fn(),
  };
  vi.stubGlobal('window', {
    history,
    location: { href: 'http://localhost/projects/example/' },
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'popstate') popState = listener;
    },
    removeEventListener: vi.fn(),
  });
  const uninstall = installInterceptor({
    beforeEach: () => vi.fn(),
    afterEach: () => vi.fn(),
  });
  const result = openModal(testModal);
  await Promise.resolve();
  const modal = modalStack.value[0]!;
  let finish!: () => void;
  modal.leaveTransition = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  history.state = {};
  popState?.();
  await Promise.resolve();
  expect(modalStack.value).toEqual([modal]);
  expect(history.pushState).toHaveBeenCalledOnce();
  finish();
  await result;
  expect(modalStack.value).toEqual([]);
  expect(history.pushState).toHaveBeenCalledOnce();
  expect(history.back).not.toHaveBeenCalled();
  uninstall();
});

test('a same-URL sentinel pop is let through instead of closing a second modal', async () => {
  stubWindow();
  const { router, navigate } = stubRouter();
  const uninstall = installInterceptor(router);

  const parentResult = openModal(testModal);
  await Promise.resolve();
  const childResult = openModal(testModal);
  await Promise.resolve();

  // vue-router runs a full navigation for our own sentinel pop and computes a
  // delta of zero for it. Aborting that navigation is what used to close a
  // second modal and make vue-router issue an extra history.go(-1).
  expect(navigate('/admin/projects/p/edit/', '/admin/projects/p/edit/')).toBe(
    undefined,
  );
  await Promise.resolve();
  await Promise.resolve();
  expect(modalStack.value).toHaveLength(2);

  closeModal();
  await childResult;
  closeModal();
  await parentResult;
  uninstall();
});

test('a real route navigation still closes exactly one modal', async () => {
  stubWindow();
  const { router, navigate } = stubRouter();
  const uninstall = installInterceptor(router);

  const parentResult = openModal(testModal);
  await Promise.resolve();
  const childResult = openModal(testModal);
  await Promise.resolve();

  expect(navigate('/admin/projects/', '/admin/projects/p/edit/')).toBe(false);
  await Promise.resolve();
  await expect(childResult).resolves.toEqual({ type: 'empty' });
  expect(modalStack.value).toHaveLength(1);

  closeModal();
  await parentResult;
  uninstall();
});

test('a modal flow holds the sentinel while the stack is momentarily empty', async () => {
  const { history } = stubWindow();
  const { router } = stubRouter();
  const uninstall = installInterceptor(router);

  await runModalFlow(async () => {
    const first = openModal(testModal);
    await Promise.resolve();
    settleModal(modalStack.value[0]!, { type: 'done', value: 1 });
    await first;

    // The wizard settles one step before it opens the next. Started from a
    // page that leaves the stack empty, which used to give the sentinel entry
    // back and race the pushState of the step now opening.
    expect(modalStack.value).toEqual([]);
    expect(history.back).not.toHaveBeenCalled();

    const second = openModal(testModal);
    await Promise.resolve();
    settleModal(modalStack.value[0]!, { type: 'done', value: 2 });
    await second;
  });

  expect(history.pushState).toHaveBeenCalledTimes(1);
  expect(history.back).toHaveBeenCalledOnce();
  uninstall();
});

test('discarding a sentinel does not disarm one pushed in the meantime', async () => {
  const { history, pop } = stubWindow();
  const { router } = stubRouter();
  const uninstall = installInterceptor(router);

  const first = openModal(testModal);
  await Promise.resolve();
  closeModal();
  await first;
  expect(history.back).toHaveBeenCalledOnce();

  // A new modal opens before the queued discard lands.
  const second = openModal(testModal);
  await Promise.resolve();
  expect(history.pushState).toHaveBeenCalledTimes(2);

  pop(); // the discard we asked for
  pop(); // the user pressing Back

  await expect(second).resolves.toEqual({ type: 'empty' });
  expect(modalStack.value).toEqual([]);
  uninstall();
});

test('dismissOneStep removes the innermost layer before the modal', async () => {
  const result = openModal(testModal);
  await Promise.resolve();
  const closeLayer = vi.fn();
  const removeLayer = registerDismissLayer(closeLayer);

  expect(dismissOneStep()).toBe(true);
  expect(closeLayer).toHaveBeenCalledOnce();
  expect(modalStack.value).toHaveLength(1);

  expect(dismissOneStep()).toBe(true);
  await expect(result).resolves.toEqual({ type: 'empty' });
  removeLayer();
});

test('the released history entry settles once the router has navigated', async () => {
  const { history, pop } = stubWindow();
  const { router, afterNavigation } = stubRouter();
  const uninstall = installInterceptor(router);

  const result = openModal(testModal);
  await Promise.resolve();
  expect(history.pushState).toHaveBeenCalledOnce();
  await expect(modalHistorySettled()).resolves.toBeUndefined();

  closeModal();
  await result;
  expect(history.back).toHaveBeenCalledOnce();

  let settled = false;
  void modalHistorySettled().then(() => (settled = true));
  pop();
  await Promise.resolve();
  // The popstate alone is not enough: the router is still navigating.
  expect(settled).toBe(false);

  afterNavigation();
  await Promise.resolve();
  expect(settled).toBe(true);
  uninstall();
});
