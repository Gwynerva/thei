import { toRaw } from 'vue';

/** What each mounted guard says would be lost by leaving the page now. */
const pageGuards = new Set<() => boolean>();

/**
 * Set once the owner has agreed to leave from the page itself: the browser
 * then does not ask the same question a second time.
 */
let leaveAgreed = false;

/**
 * Asks the browser to confirm leaving the page — closing the tab, reloading,
 * following an address — while `shouldGuard` says something would be lost.
 */
export function useBeforeUnloadGuard(shouldGuard: () => boolean) {
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!leaveAgreed && shouldGuard()) event.preventDefault();
  };
  onMounted(() => {
    pageGuards.add(shouldGuard);
    window.addEventListener('beforeunload', beforeUnload);
  });
  onUnmounted(() => {
    pageGuards.delete(shouldGuard);
    window.removeEventListener('beforeunload', beforeUnload);
  });
}

/**
 * Leaves the page by something it does itself — signing out — asking first
 * while any guard says something would be lost. Asked before `steps` begin,
 * so «Cancel» leaves everything as it was; agreed, the browser does not ask
 * again on the way out. `steps` leave the page, or answer false when the
 * owner thought better of it on the way; then, and when a step fails — the
 * server out of reach — the page stays, and closing it asks again.
 */
export async function leavePage(steps: () => Promise<boolean | void>) {
  const wouldLose = [...pageGuards].some((guard) => guard());
  if (wouldLose && !window.confirm(phrase.value.unsaved_changes_confirm))
    return;
  leaveAgreed = true;
  try {
    if ((await steps()) === false) leaveAgreed = false;
  } catch (error) {
    leaveAgreed = false;
    throw error;
  }
}

/**
 * Asks before a form is left with something unsaved: going to another page
 * of the site, closing the tab or reloading it. A modal open over the form is
 * closed instead of the page. Files still going up ask first, since leaving
 * lets them go.
 */
export function useLeaveGuard(options: {
  dirty: () => boolean;
  pendingUploads?: () => number;
  /**
   * The form is a tab of a page whose tabs change only the address's query:
   * going to another tab leaves it too.
   */
  inTab?: boolean;
}) {
  const uploading = () => (options.pendingUploads?.() ?? 0) > 0;
  useBeforeUnloadGuard(() => options.dirty() || uploading());
  if (options.inTab)
    onBeforeRouteUpdate(
      () =>
        !options.dirty() ||
        window.confirm(phrase.value.unsaved_changes_confirm),
    );
  onBeforeRouteLeave(() => {
    if (interceptModalNavigation()) return false;
    if (
      uploading() &&
      !window.confirm(phrase.value.upload_pending_leave_confirm)
    )
      return false;
    return (
      !options.dirty() || window.confirm(phrase.value.unsaved_changes_confirm)
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
 * every section inside itself, so a shallow check would either refuse every
 * edit made inside a section or wave through a section renamed in passing.
 * Going deep allows the content of any section to differ, and nothing else —
 * not a title, not a date, not a section that was not there before.
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

/**
 * Whether one part of a list the form holds — a section, an excerpt, just
 * handed over from its modal — is all that differs from the form's last
 * save, content fields aside: saving it there is then the same decision as
 * saving the form. The part is left out of both sides of the comparison,
 * found in the form by the object it is and in the last save by its uuid;
 * everything else has to match.
 */
export function changedOnlyInPart(
  current: object,
  savedSnapshot: string,
  fields: readonly string[],
  part: {
    /** The form's field that holds the list: `sections`, `excerpts`. */
    list: string;
    /** The field of a part that holds its uuid. */
    uuid: string;
    item: object;
    /** Its uuid, once a save gave it one. */
    id: string | undefined;
  },
): boolean {
  let saved: Record<string, unknown>;
  try {
    saved = JSON.parse(savedSnapshot) as Record<string, unknown>;
  } catch {
    return false;
  }
  const edited = toRaw(part.item);
  const held = (current as Record<string, unknown>)[part.list];
  const without = {
    ...current,
    [part.list]: ((held ?? []) as object[]).filter(
      (entry) => toRaw(entry) !== edited,
    ),
  };
  saved[part.list] = (
    (saved[part.list] ?? []) as Record<string, unknown>[]
  ).filter((entry) => !part.id || entry[part.uuid] !== part.id);
  return changedOnlyIn(without, JSON.stringify(saved), fields);
}

/**
 * Keys come out sorted: the comparison is by value, and an object rebuilt
 * elsewhere — a section coming back from its modal — lists the same fields in
 * its own order, which `JSON.stringify` would otherwise read as a change.
 */
function withoutFields(value: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(value))
    return value.map((item) => withoutFields(item, fields));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !fields.includes(key))
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
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
 * section moved up the list is not mistaken for new writing.
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
