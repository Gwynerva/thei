import type { HintPlacement } from './press-hint';
import type { TitlePopupContentLine } from './title-popup-content';

// Module-level state — safe because this composable is client-only.
// A single shared instance is correct: there is only ever one active title popup.
// When it shows is decided in `press-hint.ts`; this only holds what is shown.
const anchor = shallowRef<HTMLElement>();
const lines = shallowRef<TitlePopupContentLine[]>([]);
const visible = ref(false);
const popupClass = ref('');
const placement = ref<HintPlacement>('bottom');

export function useTitlePopup() {
  function show(
    el: HTMLElement,
    content: TitlePopupContentLine[],
    extraClass: string = '',
    where: HintPlacement = 'bottom',
  ) {
    anchor.value = el;
    lines.value = content;
    popupClass.value = extraClass;
    placement.value = where;
    visible.value = true;
  }

  /** Hides the popup, or only the one of `el` when given. */
  function hide(el?: HTMLElement) {
    if (el && el !== anchor.value) return;
    visible.value = false;
    anchor.value = undefined;
  }

  return { anchor, lines, visible, popupClass, placement, show, hide };
}
