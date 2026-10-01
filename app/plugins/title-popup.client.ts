import { getTitlePopup } from '#layers/thei/app/composables/title-popup-dom';
import { usePressHints } from '#layers/thei/app/composables/press-hint-dom';
import { modalStack } from '#layers/thei/app/composables/modal';

/**
 * Title popups: the hint of every `[data-title-popup]` anchor, shown when
 * `press-hint.ts` says — after a pause under the mouse, on a long press of a
 * link or a button, on a tap of anything that does nothing else when tapped,
 * and on a focus moved by the keyboard.
 */
export default defineNuxtPlugin(() => {
  const hints = usePressHints();
  if (!hints) return;
  const { show, hide } = useTitlePopup();
  const router = useRouter();

  hints.register({
    id: 'title',
    anchorFor: (target) => target.closest<HTMLElement>('[data-title-popup]'),
    hasHint: (anchor) => getTitlePopup(anchor) !== null,
    show(anchor, { placement }) {
      const data = getTitlePopup(anchor);
      if (data) show(anchor, data.lines, data.popupClass, placement);
    },
    hide: (anchor) => hide(anchor),
    delays: { hover: 400, focus: 400 },
  });

  router.afterEach(() => hints.dismiss());
  // A modal opening or closing changes what is under the hint, and what
  // Escape is for.
  watch(
    () => modalStack.value.length,
    () => hints.dismiss(),
  );
});
