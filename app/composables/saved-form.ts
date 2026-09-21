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

/**
 * Whether a form differs from its last save only inside the named fields,
 * wherever in the form they appear.
 *
 * It answers one question, for the content editor: "if I write this content
 * back, is that the only thing that would be saved?" The comparison is against
 * the last save rather than the state the page loaded with, so a form saved
 * five minutes ago whose content has been edited since counts as clean.
 *
 * The search goes all the way down on purpose. A project holds the content of
 * every stage and section inside itself, so a shallow check would either
 * refuse every edit made inside a stage or wave through a stage renamed in
 * passing. Going deep allows the content of any stage to differ, and nothing
 * else — not a title, not a date, not a stage that was not there before.
 */
export function changedOnlyIn(
  current: unknown,
  savedSnapshot: string,
  fields: readonly string[],
): boolean {
  let saved: unknown;
  try {
    saved = JSON.parse(savedSnapshot);
  } catch {
    return false;
  }
  return (
    JSON.stringify(withoutFields(current, fields)) ===
    JSON.stringify(withoutFields(saved, fields))
  );
}

function withoutFields(value: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(value))
    return value.map((item) => withoutFields(item, fields));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !fields.includes(key))
      .map(([key, item]) => [key, withoutFields(item, fields)]),
  );
}
