export const signInLinkModal = defineModal(
  'sign-in-link',
  () => import('./SignInLinkModal.vue'),
  {
    kind: 'card',
    width: 'max-w-110',
    title: () => phrase.value.sign_in_link,
  },
);
