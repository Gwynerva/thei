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
  const restoreTouchAction = applyDragTouchAction(root, options.handle);

  const sortable = Sortable.create(root, {
    animation: 180,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    forceFallback: true,
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
  let destroyed = false;

  function guardClick(handler: () => void) {
    if (Date.now() <= skipClickUntil) {
      skipClickUntil = 0;
      return;
    }
    handler();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    sortable.destroy();
    restoreTouchAction();
  }

  return { guardClick, destroy };
}

interface TouchActionStyle {
  getPropertyPriority(property: string): string;
  getPropertyValue(property: string): string;
  removeProperty(property: string): string;
  setProperty(property: string, value: string, priority?: string): void;
}

interface TouchActionElement {
  style: TouchActionStyle;
}

interface TouchActionRoot {
  querySelectorAll(selector: string): Iterable<TouchActionElement>;
}

export function applyDragTouchAction(root: TouchActionRoot, handle?: string) {
  const selector = handle ?? '[data-drag-id]';
  const original = new Map<
    TouchActionElement,
    { value: string; priority: string }
  >();

  function apply() {
    for (const element of root.querySelectorAll(selector)) {
      if (original.has(element)) continue;
      original.set(element, {
        value: element.style.getPropertyValue('touch-action'),
        priority: element.style.getPropertyPriority('touch-action'),
      });
      element.style.setProperty('touch-action', 'none');
    }
  }

  apply();
  const observer =
    typeof MutationObserver === 'undefined'
      ? undefined
      : new MutationObserver(() => apply());
  observer?.observe(root as unknown as Node, {
    childList: true,
    subtree: true,
  });

  return () => {
    observer?.disconnect();
    for (const [element, previous] of original) {
      if (previous.value) {
        element.style.setProperty(
          'touch-action',
          previous.value,
          previous.priority,
        );
      } else {
        element.style.removeProperty('touch-action');
      }
    }
    original.clear();
  };
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
      if (controller) controller.guardClick(handler);
      else handler();
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
