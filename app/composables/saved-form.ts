export function useSavedForm(
  isDirty: Ref<boolean>,
  save: () => void | Promise<void>,
  canSave: Ref<boolean>,
) {
  useSaveShortcut(save, { canSave });
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (isDirty.value) event.preventDefault();
  };
  onMounted(() => window.addEventListener('beforeunload', beforeUnload));
  onUnmounted(() => window.removeEventListener('beforeunload', beforeUnload));
  onBeforeRouteLeave(() => {
    if (interceptModalNavigation()) return false;
    return (
      !isDirty.value || window.confirm(phrase.value.unsaved_changes_confirm)
    );
  });
}
