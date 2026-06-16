import { beforeEach, expect, test } from 'vitest';
import { defineComponent, type Component } from 'vue';
import {
  closeModal,
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

test('closeModal only closes the active top modal', async () => {
  const firstResult = openModal(testModal);
  await flushMicrotasks();
  const firstModal = modalStack.value[0]!;

  const secondResult = openModal(testModal);
  await flushMicrotasks();

  closeModal();

  await expect(secondResult).resolves.toEqual({ type: 'empty' });
  expect(modalStack.value).toEqual([firstModal]);

  settleModal(firstModal, { type: 'done', value: 1 });

  await expect(firstResult).resolves.toEqual({ type: 'done', value: 1 });
  expect(modalStack.value).toEqual([]);
});

function flushMicrotasks() {
  return Promise.resolve();
}
