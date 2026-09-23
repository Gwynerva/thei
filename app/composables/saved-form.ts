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

/**
 * Stamps the content a save has just stored with the time it was stored.
 *
 * A form keeps each content field as the editor handed it over, stamp and
 * all, and the stamp does not come back on its own: the content editor, opened
 * again or still open after saving from inside itself, would go on showing the
 * time the page was loaded. So once a save succeeds, every content field whose
 * blocks differ from the last save is given the save's time. Call it before
 * the form marks itself saved, so the new stamps are part of what counts as
 * saved rather than a change of their own.
 *
 * Items of a list are matched to their saved counterparts by public ID, so a
 * stage moved up the list is not mistaken for new writing.
 */
export function stampSavedContent(
  current: unknown,
  savedSnapshot: string,
  fields: readonly string[],
  savedAt = Date.now(),
) {
  let saved: unknown;
  try {
    saved = JSON.parse(savedSnapshot);
  } catch {
    saved = undefined;
  }
  stampWithin(current, saved, fields, savedAt);
}

function stampWithin(
  value: unknown,
  saved: unknown,
  fields: readonly string[],
  savedAt: number,
) {
  if (Array.isArray(value)) {
    const previous = Array.isArray(saved) ? saved : [];
    value.forEach((item, index) =>
      stampWithin(item, counterpart(item, previous, index), fields, savedAt),
    );
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  const previous =
    saved && typeof saved === 'object'
      ? (saved as Record<string, unknown>)
      : {};
  for (const [key, item] of Object.entries(record)) {
    if (fields.includes(key) && isStampedContent(item)) {
      const before = previous[key];
      const beforeData = isStampedContent(before) ? before.data : undefined;
      if (JSON.stringify(item.data) !== JSON.stringify(beforeData))
        item.updatedAt = savedAt;
    } else {
      stampWithin(item, previous[key], fields, savedAt);
    }
  }
}

function counterpart(item: unknown, list: unknown[], index: number) {
  const publicId =
    item && typeof item === 'object'
      ? (item as { publicId?: unknown }).publicId
      : undefined;
  if (typeof publicId !== 'string' || !publicId) return list[index];
  return list.find(
    (candidate) =>
      !!candidate &&
      typeof candidate === 'object' &&
      (candidate as { publicId?: unknown }).publicId === publicId,
  );
}

function isStampedContent(
  value: unknown,
): value is { data: unknown; updatedAt?: number } {
  return !!value && typeof value === 'object' && 'data' in value;
}
