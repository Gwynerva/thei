import type { Ref } from 'vue';
import { moveItemById, useDragSort } from './drag-sort';

/**
 * What a part a form edits in a modal of its own has — a project's section,
 * an excerpt of an entry, an event or a project: a public ID from the start,
 * a uuid once a save gives it one (`uuid` of the options), and a text.
 */
interface ModalPart {
  publicId: string;
  content: { data: unknown; contentUuid?: string };
}

/** What a part's modal is handed to give the part back to the form. */
export interface ModalPartEdit<T> {
  /**
   * Takes the part from its modal into the form, in place of the one it
   * was opened with, and returns it as the form now holds it.
   */
  take: (item: T) => T;
  /**
   * Whether the form's last save holds the part as the form holds it now.
   * A part handed over from its modal waits in the form until the form is
   * saved with it.
   */
  stored: () => boolean;
  /** The parts with the modal's draft in place of the one it was opened with. */
  withDraft: (draft: T) => T[];
}

export interface ModalPartsOptions<T, K extends string> {
  /** The field a part's identity is kept in once a save gives it one. */
  uuid: K;
  /** The query that opens a part straight away, by its public ID. */
  query: string;
  /** The parts as the form holds them. */
  items: () => T[];
  setItems: (items: T[]) => void;
  /** The parts as the form's last save holds them. */
  savedItems: () => readonly T[];
  /**
   * Whether the form stands on its entity's own address. Only there does
   * the query open a part: reached otherwise, the editor first moves there,
   * and the page mounted at the old address must not open it too.
   */
  atOwnAddress: () => boolean;
  /** Opens the part the query names: in its tab, where the list has tabs. */
  open: (target: T) => Promise<void>;
  /** The list: its rows are dragged in it, and a moved row's grip takes the focus back. */
  root: Readonly<Ref<HTMLElement | null>>;
  /** The grip of a row. */
  handle: string;
  /**
   * The parts dragged into the owner's order, and how they go back among
   * the rest; all of them when not given. A project's dated sections keep
   * the order of their dates, and only the general ones are dragged, while
   * their tab is shown.
   */
  sorted?: {
    items: () => T[];
    arrange: (sorted: T[]) => void;
    shown: () => boolean;
  };
}

/**
 * A list of parts a form holds and edits each in a modal of its own — a
 * project's sections, the excerpts of an entry, an event or a project. A
 * row opens its part, "+" a new one; rows are dragged, or moved by the
 * arrows on their grip, into the owner's order; `?<query>=<publicId>`
 * opens a part straight away.
 *
 * Parts are addressed by the object the form holds, never by their
 * position: a modal or a confirmation stays open over the list while it is
 * dragged or re-sorted. The form mutates its parts in place when a save
 * assigns them identities, so the object stays a valid handle for as long
 * as the part exists.
 */
export function useModalParts<
  K extends string,
  T extends ModalPart & Partial<Record<K, string>>,
>(options: ModalPartsOptions<T, K>) {
  const route = useRoute();
  const unsavedIds = new WeakMap<object, string>();
  const uuidOf = (item: T | undefined) => item?.[options.uuid];

  /** The row's key and drag id: its uuid, or one made for it until it has one. */
  function itemId(item: T) {
    const uuid = uuidOf(item);
    if (uuid) return uuid;
    let generated = unsavedIds.get(item);
    if (!generated) {
      generated = crypto.randomUUID();
      unsavedIds.set(item, generated);
    }
    return generated;
  }

  function replaceItem(previous: T | undefined, next: T) {
    const items = options.items();
    const index = previous ? items.indexOf(previous) : -1;
    const list = [...items];
    if (index < 0) list.push(next);
    else list[index] = next;
    options.setItems(list);
  }

  /**
   * Removing is never saved on its own: it takes the part's text, files and
   * page with it, so it waits for the form's Save button like any other
   * decision that cannot be taken back.
   */
  function removeItem(target: T) {
    // The list holds reactive proxies, while a part the modal has just
    // handed over is the plain object behind one.
    options.setItems(
      options.items().filter((item) => toRaw(item) !== toRaw(target)),
    );
  }

  /**
   * The modal keeps its own draft and does not learn what a save gives
   * back: the identity the server assigned to a new part, and the time
   * stamped on its text. Both are carried over from the part the form
   * already holds, so handing the draft over again neither loses them nor
   * reads as a change.
   */
  function mergeSaved(previous: T | undefined, next: T): T {
    if (!previous) return next;
    const merged = { ...next };
    merged[options.uuid] ??= previous[options.uuid];
    if (
      previous.content &&
      merged.content &&
      JSON.stringify(previous.content.data) ===
        JSON.stringify(merged.content.data) &&
      previous.content.contentUuid === merged.content.contentUuid
    )
      merged.content = previous.content;
    return merged;
  }

  function stored(part: T | undefined) {
    // Read through the form's own list, so that a save setting the part's
    // identity and stamping its text is heard.
    const held =
      part && options.items().find((item) => toRaw(item) === toRaw(part));
    const uuid = uuidOf(held);
    const saved = options
      .savedItems()
      .find((item) => uuid && uuidOf(item) === uuid);
    return Boolean(saved) && JSON.stringify(held) === JSON.stringify(saved);
  }

  /**
   * One modal at a time from this list. `openModal` loads the component
   * before the modal enters the stack, so a quick second click would
   * otherwise stack a duplicate on top of the first.
   */
  let busy = false;

  /**
   * Opens a part — or a new one, without `target` — in its modal through
   * `open`, handing it how to give the part back; a part the modal deleted
   * leaves the list.
   */
  async function edit(
    target: T | undefined,
    open: (edit: ModalPartEdit<T>) => Promise<{ type: string }>,
  ) {
    if (busy) return;
    busy = true;
    try {
      // The part as the form holds it: the modal hands over new ones.
      const current = shallowRef(target);
      const result = await open({
        take: (item) => {
          const merged = mergeSaved(current.value, item);
          replaceItem(current.value, merged);
          current.value = merged;
          return merged;
        },
        stored: () => stored(current.value),
        withDraft: (draft) =>
          current.value
            ? options
                .items()
                .map((item) =>
                  toRaw(item) === toRaw(current.value) ? draft : item,
                )
            : [...options.items(), draft],
      });
      if (result.type === 'deleted' && current.value) removeItem(current.value);
    } finally {
      busy = false;
    }
  }

  const sorted = options.sorted ?? {
    items: options.items,
    arrange: options.setItems,
    shown: () => true,
  };

  function move(id: string, newIndex: number) {
    sorted.arrange(moveItemById(sorted.items(), id, newIndex, itemId));
  }

  const dragSort = useDragSort(
    () => (sorted.shown() ? options.root.value : null),
    {
      handle: options.handle,
      onDrop: ({ id, newIndex }) => move(id, newIndex),
    },
  );

  /**
   * Moving a row moves its element, and an element moved in the document
   * loses the focus: the grip takes it back, so the arrows can go on.
   */
  async function moveWithKeyboard(target: T, direction: -1 | 1) {
    const items = sorted.items();
    const newIndex = items.indexOf(target) + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const id = itemId(target);
    move(id, newIndex);
    await nextTick();
    options.root.value
      ?.querySelector<HTMLElement>(`[data-drag-id="${id}"] ${options.handle}`)
      ?.focus();
  }

  /**
   * `?<query>=<publicId>` opens that part: it is how the admin bar on the
   * part's public page lands here, and a link to it from anywhere in the
   * admin. The query is dropped before the modal opens, so going back or
   * reloading does not open it again.
   */
  async function openWanted() {
    const wanted = route.query[options.query];
    if (typeof wanted !== 'string') return;
    if (!options.atOwnAddress()) return;
    const target = options.items().find((item) => item.publicId === wanted);
    const query = { ...route.query };
    delete query[options.query];
    // The path goes along: without it the router rebuilds the address from
    // the route's pattern, which has no trailing slash, and the admin bar
    // no longer recognizes the editor.
    await navigateTo({ path: route.path, query }, { replace: true });
    if (target) await options.open(target);
  }
  onMounted(openWanted);
  watch(() => route.query[options.query], openWanted);

  return {
    itemId,
    edit,
    moveWithKeyboard,
    /** A click on a row that ends a drag opens nothing. */
    guardClick: dragSort.guardClick,
  };
}
