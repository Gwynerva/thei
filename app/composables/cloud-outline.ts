import { cloudOutlinePath } from '#layers/thei/shared/cloud-outline';

/**
 * A cloud outline that follows the size of an element.
 *
 * The path is empty until the element has been measured — on the server and
 * during the first paint — so whatever draws it should stay invisible until
 * then rather than guess a size.
 */
export function useCloudOutline(
  target: Readonly<Ref<Element | null | undefined>>,
  seed: MaybeRefOrGetter<string>,
) {
  return useMeasuredOutline(target, (width, height) =>
    cloudOutlinePath(width, height, toValue(seed)),
  );
}

/** The sizes every measured outline of the page waits for, by element. */
const sizeListeners = new WeakMap<
  Element,
  Set<(rect: DOMRectReadOnly) => void>
>();
/** One observer for them all, made once something is to be measured. */
let sizeObserver: ResizeObserver | undefined;

function observeSize(
  element: Element,
  listener: (rect: DOMRectReadOnly) => void,
) {
  sizeObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries)
      for (const notify of sizeListeners.get(entry.target) ?? [])
        notify(entry.contentRect);
  });
  let listeners = sizeListeners.get(element);
  if (!listeners) {
    sizeListeners.set(element, (listeners = new Set()));
    sizeObserver.observe(element);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    sizeListeners.delete(element);
    sizeObserver?.unobserve(element);
  };
}

/**
 * An outline drawn by `build` for the size an element has, redrawn as it
 * changes, and empty until it has been measured. Nothing is observed while
 * there is no element: a card that draws no outline costs nothing.
 */
export function useMeasuredOutline(
  target: Readonly<Ref<Element | null | undefined>>,
  build: (width: number, height: number) => string,
) {
  const size = shallowRef<{ width: number; height: number }>();
  let stop: (() => void) | undefined;

  onMounted(() => {
    if (typeof ResizeObserver === 'undefined') return;
    watch(
      target,
      (element) => {
        stop?.();
        stop = element
          ? observeSize(element, ({ width, height }) => {
              if (size.value?.width === width && size.value?.height === height)
                return;
              size.value = { width, height };
            })
          : undefined;
      },
      { immediate: true },
    );
  });
  onBeforeUnmount(() => stop?.());

  return computed(() =>
    size.value ? build(size.value.width, size.value.height) : '',
  );
}

let boxRadiusPx: number | undefined;

/**
 * The corner every box card has, in pixels, for an outline drawn in its
 * place. Read once for all the cards on a page, and again after the window
 * changes size, which may move the root's font size the corner follows.
 */
export function boxRadius(): number {
  if (boxRadiusPx !== undefined) return boxRadiusPx;
  window.addEventListener(
    'resize',
    () => {
      boxRadiusPx = undefined;
    },
    { once: true, passive: true },
  );
  const root = getComputedStyle(document.documentElement);
  const value = root.getPropertyValue('--radius-normal').trim();
  return (boxRadiusPx = value.endsWith('rem')
    ? parseFloat(value) * parseFloat(root.fontSize)
    : parseFloat(value) || 0);
}
