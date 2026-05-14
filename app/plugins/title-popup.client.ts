function getTitlePopup(
  el: HTMLElement,
): { text: string; popupClass: string } | null {
  const text = el.getAttribute('thei-title-popup');
  if (text === null) return null;
  const popupClass = el.getAttribute('thei-title-popup-class') ?? '';
  return { text, popupClass };
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
    if (target.closest('[thei-title-popup-el]')) return;

    const anchor = target.closest<HTMLElement>('[thei-title-popup]');
    if (anchor === currentAnchor) return;
    currentAnchor = anchor;

    if (anchor) {
      const data = getTitlePopup(anchor);
      if (data) show(anchor, data.text, data.popupClass);
      else hide();
    } else {
      hide();
    }
  });

  // Cursor left the viewport
  document.addEventListener('mouseleave', () => {
    currentAnchor = null;
    hide();
  });

  // --- Touch ---

  document.addEventListener(
    'touchstart',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[thei-title-popup-el]')) return;

      const anchor = target.closest<HTMLElement>('[thei-title-popup]');
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
      show(anchor, data.text, data.popupClass);
    },
    { passive: true },
  );

  // --- Navigation ---

  router.afterEach(() => {
    hide();
    disableTouchListeners();
  });
});
