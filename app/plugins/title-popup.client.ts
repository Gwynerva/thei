import {
  readTitlePopup,
  type TitlePopupContentLine,
} from '#layers/thei/app/composables/title-popup-content';

/**
 * Whether any part of an anchor marked `data-title-popup-clip` is cut short —
 * by an ellipsis on one line, or by a clamp of several.
 */
function isClipped(el: HTMLElement) {
  return Array.from(
    el.querySelectorAll<HTMLElement>('[data-title-popup-clip]'),
  ).some(
    (part) =>
      part.scrollWidth > part.clientWidth + 1 ||
      part.scrollHeight > part.clientHeight + 1,
  );
}

function getTitlePopup(
  el: HTMLElement,
): { lines: TitlePopupContentLine[]; popupClass: string } | null {
  // A control whose own label is on screen needs no hint repeating it: the
  // label may only be shown at some widths, and the hint covers the others.
  const label = el.querySelector<HTMLElement>('[data-title-popup-label]');
  if (label?.getClientRects().length) return null;
  // A popup that repeats the text on screen (`data-title-popup-clipped`) is
  // only worth showing when some of that text is cut, unless it also says
  // something the screen does not (`data-title-popup-always`).
  if (
    el.dataset.titlePopupClipped !== undefined &&
    el.dataset.titlePopupAlways === undefined &&
    !isClipped(el)
  )
    return null;
  const lines = readTitlePopup(
    el.dataset.titlePopup,
    el.dataset.titlePopupRich,
  );
  if (!lines) return null;
  const popupClass = el.dataset.titlePopupClass ?? '';
  return { lines, popupClass };
}

export default defineNuxtPlugin(() => {
  const { show, hide } = useTitlePopup();
  const router = useRouter();

  // Track the element currently "targeted" so rapid mouseover across child
  // elements of the same anchor doesn't re-arm the delay timer.
  let currentAnchor: HTMLElement | null = null;

  // --- Touch-only helpers ---

  let touchScrollBreaker: (() => void) | null = null;
  let touchOutsideCloser: ((e: TouchEvent) => void) | null = null;

  function enableTouchScrollBreaker() {
    touchScrollBreaker = () => {
      hide();
      disableTouchListeners();
    };
    window.addEventListener('scroll', touchScrollBreaker, { passive: true });
    window.addEventListener('resize', touchScrollBreaker);
  }

  function disableTouchScrollBreaker() {
    if (!touchScrollBreaker) return;
    window.removeEventListener('scroll', touchScrollBreaker);
    window.removeEventListener('resize', touchScrollBreaker);
    touchScrollBreaker = null;
  }

  function enableTouchOutsideCloser(anchor: HTMLElement) {
    touchOutsideCloser = (e: TouchEvent) => {
      const target = e.target as Node | null;
      // Touch inside the anchor keeps the popup open
      if (target && anchor.contains(target)) return;
      hide();
      disableTouchListeners();
    };
    window.addEventListener('touchstart', touchOutsideCloser, true);
  }

  function disableTouchOutsideCloser() {
    if (!touchOutsideCloser) return;
    window.removeEventListener('touchstart', touchOutsideCloser, true);
    touchOutsideCloser = null;
  }

  function disableTouchListeners() {
    disableTouchScrollBreaker();
    disableTouchOutsideCloser();
    currentAnchor = null;
  }

  // --- Mouse ---

  // mouseover bubbles → one delegated listener covers the whole document.
  // The anchor comparison prevents re-arming the delay when cursor moves
  // between child elements of the same anchor.
  document.addEventListener('mouseover', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    // Cursor entered the popup itself — ignore
    if (target.closest('[data-title-popup-el]')) return;

    const anchor = target.closest<HTMLElement>('[data-title-popup]');
    if (anchor === currentAnchor) return;
    currentAnchor = anchor;

    if (anchor) {
      const data = getTitlePopup(anchor);
      if (data) show(anchor, data.lines, data.popupClass);
      else hide();
    } else {
      hide();
    }
  });

  // Cursor left the viewport
  document.documentElement.addEventListener('mouseleave', () => {
    currentAnchor = null;
    hide();
  });

  // --- Touch ---

  document.addEventListener(
    'touchstart',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-title-popup-el]')) return;

      const anchor = target.closest<HTMLElement>('[data-title-popup]');
      if (!anchor) {
        hide();
        disableTouchListeners();
        return;
      }

      const data = getTitlePopup(anchor);
      if (!data) return;

      // Reset any previous touch session before starting a new one
      disableTouchListeners();
      currentAnchor = anchor;
      enableTouchScrollBreaker();
      enableTouchOutsideCloser(anchor);
      show(anchor, data.lines, data.popupClass);
    },
    { passive: true },
  );

  // --- Navigation ---

  router.afterEach(() => {
    hide();
    disableTouchListeners();
  });
});
