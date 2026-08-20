import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { defineComponent, nextTick, type Component } from 'vue';
import {
  closeModal,
  installModalNavigationInterceptor,
  interceptModalNavigation,
  modalStack,
  openModal,
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

afterEach(() => vi.unstubAllGlobals());

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
  const router = { beforeEach: vi.fn(() => removeGuard) };
  const uninstall = installModalNavigationInterceptor(router as any);

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
