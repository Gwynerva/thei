type ViewportCallback = (visible: boolean) => void;

const callbacks = new WeakMap<Element, ViewportCallback>();
let observer: IntersectionObserver | undefined;

/**
 * Drops the shared observer, so the next watcher builds a new one.
 *
 * Only a test needs this: it replaces `IntersectionObserver` between cases,
 * and an observer built from the previous stub would report to nobody.
 */
export function resetViewportObserver(): void {
  observer?.disconnect();
  observer = undefined;
}

/**
 * Watches an element entering and leaving the viewport through one observer
 * shared by the whole page, instead of one observer per watched element.
 * Returns the function that stops watching.
 */
export function observeViewport(
  element: Element,
  callback: ViewportCallback,
): () => void {
  if (!('IntersectionObserver' in window)) {
    callback(true);
    return () => {};
  }
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries)
        callbacks.get(entry.target)?.(entry.isIntersecting);
    },
    { threshold: 0.01 },
  );
  callbacks.set(element, callback);
  observer.observe(element);
  return () => {
    callbacks.delete(element);
    observer?.unobserve(element);
  };
}
