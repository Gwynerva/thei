export type PickTestResult = { type: 'test'; value: number };

export const pickTestModal = defineModal(
  'test',
  () => import('./ModalPickTest.vue'),
);
