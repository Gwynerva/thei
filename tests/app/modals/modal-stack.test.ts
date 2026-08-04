import { beforeEach, expect, test, vi } from 'vitest';
import { defineComponent, nextTick, type Component } from 'vue';
import {
  backModal,
  closeModal,
  createModalFlow,
  modalDismissVersion,
  modalStack,
  openModal,
  requestCloseActiveModalFlow,
  settleModal,
} from '../../../app/composables/modal';
import type { ModalDescriptor } from '../../../app/modals/types';

type TestModalResult = { type: 'done'; value: number } | { type: 'empty' };

const TestComponent = defineComponent({});

const testModal: ModalDescriptor<TestModalResult, Component> = {
  name: 'test',
  component: () => Promise.resolve({ default: TestComponent }),
};

type TestDataComponent = Component &
  (abstract new (...args: any[]) => {
    $props: { modalData: { value: string } };
  });

const testDataModal: ModalDescriptor<TestModalResult, TestDataComponent> = {
  name: 'test-data',
  component: () =>
    Promise.resolve({ default: TestComponent as TestDataComponent }),
};

beforeEach(() => {
  modalStack.value = [];
  modalDismissVersion.value = 0;
});

test('openModal keeps lower modals alive when the top modal is settled', async () => {
  const firstResult = openModal(testModal);
  await flushMicrotasks();
  const firstModal = modalStack.value[0]!;

  const secondResult = openModal(testModal);
  await flushMicrotasks();
  const secondModal = modalStack.value[1]!;

  settleModal(secondModal, { type: 'done', value: 2 });

  await expect(secondResult).resolves.toEqual({ type: 'done', value: 2 });
  expect(modalStack.value).toEqual([firstModal]);

  settleModal(firstModal, { type: 'done', value: 1 });

  await expect(firstResult).resolves.toEqual({ type: 'done', value: 1 });
  expect(modalStack.value).toEqual([]);
});

test('openModal stores navigation labels', async () => {
  const result = openModal(
    testDataModal,
    { value: 'data' },
    { label: 'Current', backLabel: 'Previous' },
  );
  await flushMicrotasks();

  expect(modalStack.value[0]).toMatchObject({
    label: 'Current',
    backLabel: 'Previous',
  });

  closeModal();
  await result;
});

test('backModal only closes the active top modal', async () => {
  const firstResult = openModal(testModal);
  await flushMicrotasks();
  const firstModal = modalStack.value[0]!;

  const secondResult = openModal(testModal);
  await flushMicrotasks();

  backModal();

  await expect(secondResult).resolves.toEqual({ type: 'empty' });
  expect(modalStack.value).toEqual([firstModal]);

  settleModal(firstModal, { type: 'done', value: 1 });

  await expect(firstResult).resolves.toEqual({ type: 'done', value: 1 });
  expect(modalStack.value).toEqual([]);
});

test('backModal restores focus to the control that opened the child', async () => {
  const parentResult = openModal(testModal);
  await flushMicrotasks();
  const childResult = openModal(testModal);
  await flushMicrotasks();
  const focus = vi.fn();
  modalStack.value[1]!.returnFocus = { isConnected: true, focus };

  backModal();
  await childResult;
  await nextTick();

  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  settleModal(modalStack.value[0]!, { type: 'done', value: 1 });
  await parentResult;
});

test('settling a child restores focus without closing its parent', async () => {
  const parentResult = openModal(testModal);
  await flushMicrotasks();
  const childResult = openModal(testModal);
  await flushMicrotasks();
  const child = modalStack.value[1]!;
  const focus = vi.fn();
  child.returnFocus = { isConnected: true, focus };

  settleModal(child, { type: 'done', value: 2 });
  await childResult;
  await nextTick();

  expect(focus).toHaveBeenCalledOnce();
  expect(modalStack.value).toHaveLength(1);
  settleModal(modalStack.value[0]!, { type: 'done', value: 1 });
  await parentResult;
});

test('closeModal closes only the active flow and keeps its parent modal', async () => {
  const firstResult = openModal(testModal);
  await flushMicrotasks();
  const firstModal = modalStack.value[0]!;
  const secondResult = openModal(testModal);
  await flushMicrotasks();

  closeModal();

  await expect(secondResult).resolves.toEqual({ type: 'empty' });
  expect(modalStack.value).toEqual([firstModal]);
  expect(modalDismissVersion.value).toBe(1);

  settleModal(firstModal, { type: 'done', value: 1 });
  await expect(firstResult).resolves.toEqual({ type: 'done', value: 1 });
});

test('closeModal closes every related screen in the active flow', async () => {
  const flowId = createModalFlow();
  const firstResult = openModal(testDataModal, { value: 'first' }, { flowId });
  await flushMicrotasks();
  const secondResult = openModal(
    testDataModal,
    { value: 'second' },
    { flowId },
  );
  await flushMicrotasks();

  closeModal();

  await expect(secondResult).resolves.toEqual({ type: 'empty' });
  await expect(firstResult).resolves.toEqual({ type: 'empty' });
  expect(modalStack.value).toEqual([]);
});

test('dismissal guard can keep the active modal open', async () => {
  const result = openModal(testModal);
  await flushMicrotasks();
  const modal = modalStack.value[0]!;
  let allowClose = false;
  modal.closeGuard = () => allowClose;

  expect(requestCloseActiveModalFlow({ type: 'empty' })).toBe(false);
  expect(modalStack.value).toEqual([modal]);

  allowClose = true;
  expect(requestCloseActiveModalFlow({ type: 'empty' })).toBe(true);
  await expect(result).resolves.toEqual({ type: 'empty' });
});

test('back navigation respects only the active nested modal guard', async () => {
  const parentResult = openModal(testModal);
  await flushMicrotasks();
  const parent = modalStack.value[0]!;
  const childResult = openModal(testModal);
  await flushMicrotasks();
  const child = modalStack.value[1]!;
  child.closeGuard = () => false;

  backModal();
  expect(modalStack.value).toEqual([parent, child]);

  child.closeGuard = () => true;
  backModal();
  await expect(childResult).resolves.toEqual({ type: 'empty' });
  expect(modalStack.value).toEqual([parent]);

  settleModal(parent, { type: 'done', value: 1 });
  await parentResult;
});

function flushMicrotasks() {
  return Promise.resolve();
}
