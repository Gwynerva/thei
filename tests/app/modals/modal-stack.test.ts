import { beforeEach, expect, test, vi } from 'vitest';
import { defineComponent, nextTick, type Component } from 'vue';
import { closeModal, modalStack, openModal, settleModal } from '../../../app/composables/modal';
import type { ModalDescriptor } from '../../../app/modals/types';

type TestModalResult = { type: 'done'; value: number } | { type: 'empty' };
const TestComponent = defineComponent({});
const testModal: ModalDescriptor<TestModalResult, Component> = {
  name: 'test', component: () => Promise.resolve({ default: TestComponent }),
};

beforeEach(() => { modalStack.value = []; });

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
