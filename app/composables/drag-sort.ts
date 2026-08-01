import Sortable, { type Options, type SortableEvent } from 'sortablejs';

const CLICK_GUARD_MS = 250;

export interface SortableDrop {
  id: string;
  to: HTMLElement;
  newIndex: number;
}

export interface SortableControllerOptions {
  handle?: string;
  group?: Options['group'];
  onDrop: (drop: SortableDrop) => void;
}

export function createDragSort(
  root: HTMLElement,
  options: SortableControllerOptions,
) {
  let skipClickUntil = 0;

  const sortable = Sortable.create(root, {
    animation: 150,
    draggable: '[data-drag-id]',
    handle: options.handle,
    group: options.group,
    fallbackOnBody: true,
    fallbackTolerance: 6,
    touchStartThreshold: 6,
    emptyInsertThreshold: 16,
    filter: '[data-drag-ignore]',
    preventOnFilter: false,
    ghostClass: 'opacity-35',
    chosenClass: 'ring-2',
    dragClass: 'shadow-xl',
    onEnd(event) {
      skipClickUntil = Date.now() + CLICK_GUARD_MS;
      if (
        event.from !== event.to ||
        event.oldDraggableIndex !== event.newDraggableIndex
      ) {
        const drop = normalizeDrop(event);
        if (drop) options.onDrop(drop);
      }
    },
  });

  function guardClick(handler: () => void) {
    if (Date.now() <= skipClickUntil) {
      skipClickUntil = 0;
      return;
    }
    handler();
  }

  function destroy() {
    sortable.destroy();
  }

  return { guardClick, destroy };
}

export function useDragSort(
  root: MaybeRefOrGetter<HTMLElement | null | undefined>,
  options: SortableControllerOptions,
) {
  let controller: ReturnType<typeof createDragSort> | undefined;

  watch(
    () => toValue(root),
    (element) => {
      controller?.destroy();
      controller = element ? createDragSort(element, options) : undefined;
    },
    { immediate: true, flush: 'post' },
  );

  onUnmounted(() => controller?.destroy());

  return {
    guardClick(handler: () => void) {
      controller?.guardClick(handler);
    },
  };
}

export function moveItemById<T>(
  items: readonly T[],
  id: string,
  newIndex: number,
  getId: (item: T) => string,
): T[] {
  const oldIndex = items.findIndex((item) => getId(item) === id);
  if (oldIndex < 0 || oldIndex === newIndex) return [...items];
  const next = [...items];
  const [moved] = next.splice(oldIndex, 1);
  if (!moved) return next;
  next.splice(Math.max(0, Math.min(newIndex, next.length)), 0, moved);
  return next;
}

export function moveItemToGroup<T, TGroup extends string>(
  items: readonly T[],
  id: string,
  targetGroup: TGroup,
  newIndex: number,
  groupOrder: readonly TGroup[],
  getId: (item: T) => string,
  getGroup: (item: T) => TGroup,
  setGroup: (item: T, group: TGroup) => T,
): T[] {
  const moved = items.find((item) => getId(item) === id);
  if (!moved) return [...items];
  const grouped = new Map(
    groupOrder.map((group) => [
      group,
      items.filter((item) => getGroup(item) === group && getId(item) !== id),
    ]),
  );
  const target = grouped.get(targetGroup);
  if (!target) return [...items];
  target.splice(
    Math.max(0, Math.min(newIndex, target.length)),
    0,
    setGroup(moved, targetGroup),
  );
  return groupOrder.flatMap((group) => grouped.get(group) ?? []);
}

function normalizeDrop(event: SortableEvent): SortableDrop | undefined {
  const id = dragId(event.item);
  if (
    !id ||
    event.oldDraggableIndex == null ||
    event.newDraggableIndex == null
  ) {
    return undefined;
  }
  return {
    id,
    to: event.to,
    newIndex: event.newDraggableIndex,
  };
}

function dragId(element: HTMLElement) {
  return element.dataset.dragId;
}
