/**
 * How modals move: the site's one transition, read from the stylesheet so it
 * stays the same as every `transition` utility, and none at all under
 * reduced motion.
 */
export function modalMotion(): { duration: number; easing: string } {
  if (
    typeof window === 'undefined' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return { duration: 0, easing: 'linear' };
  const style = getComputedStyle(document.documentElement);
  return {
    duration:
      cssTime(style.getPropertyValue('--default-transition-duration')) ?? 150,
    easing:
      style.getPropertyValue('--default-transition-timing-function').trim() ||
      'cubic-bezier(0.4, 0, 0.2, 1)',
  };
}

function cssTime(value: string): number | undefined {
  const text = value.trim();
  const number = Number.parseFloat(text);
  if (!Number.isFinite(number)) return undefined;
  return text.endsWith('ms') ? number : number * 1000;
}

/**
 * Fades an element in or out from wherever it stands now, so one cut short
 * goes on from there; settles at once without motion. `late` holds it unseen
 * for a transition's length first, as a wait does, which a quick step never
 * shows.
 */
export function fadeElement(
  element: Element,
  to: 0 | 1,
  { late = false }: { late?: boolean } = {},
): Promise<void> {
  const { duration, easing } = modalMotion();
  if (!duration || !(element instanceof HTMLElement) || !element.animate)
    return Promise.resolve();
  const from = to === 0 ? Number(getComputedStyle(element).opacity) : 0;
  for (const running of element.getAnimations()) running.cancel();
  const delay = late ? duration : 0;
  const animation = element.animate([{ opacity: from }, { opacity: to }], {
    duration,
    easing,
    delay,
    // Waiting, it stays unseen; gone, it stays so until it is taken away.
    fill: to === 0 ? 'forwards' : 'backwards',
  });
  // A page in a background tab draws no frames, and its animations stand
  // still; the modal must not wait on them for ever.
  const fallback = setTimeout(() => animation.finish(), delay + duration + 100);
  return animation.finished.then(
    () => clearTimeout(fallback),
    () => clearTimeout(fallback),
  );
}

/** When each shell on screen was put there. */
const shellShownAt = new WeakMap<Element, number>();

/** The enter hook of a shell: it only notes the moment it went up. */
export function markShellShown(element: Element, done: () => void) {
  shellShownAt.set(element, performance.now());
  done();
}

/**
 * The leave hook of a shell giving way to what it stood in for: what came is
 * already drawn beneath it. A shell up for less than a transition's length,
 * whose wait never showed, goes at once — it was still coming in with its
 * layer; one that was seen fades off what replaced it.
 */
export function fadeShellOut(element: Element, done: () => void) {
  if (element instanceof HTMLElement) {
    element.style.pointerEvents = 'none';
    element.setAttribute('aria-hidden', 'true');
  }
  const shownAt = shellShownAt.get(element);
  if (
    shownAt !== undefined &&
    performance.now() - shownAt < modalMotion().duration
  )
    return done();
  void fadeElement(element, 0).then(done);
}
