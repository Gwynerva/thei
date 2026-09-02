import type { AdminBarButtonProps } from '../components/admin/bar/AdminBarButton.vue';

type AdminBarContextButton = {
  ownerId: string;
  routePath: string;
  props: AdminBarButtonProps;
};

export function useAdminBarContextButton() {
  return useState<AdminBarContextButton | undefined>(
    'admin-bar-context-button',
    () => undefined,
  );
}

export function useRegisterAdminBarContextButton(
  button: ComputedRef<AdminBarButtonProps | undefined>,
) {
  const contextButton = useAdminBarContextButton();
  const ownerId = useId();
  const routePath = useRoute().path;

  watch(
    button,
    (props) => {
      if (props) {
        contextButton.value = { ownerId, routePath, props };
      } else if (contextButton.value?.ownerId === ownerId) {
        contextButton.value = undefined;
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    if (contextButton.value?.ownerId === ownerId)
      contextButton.value = undefined;
  });
}
