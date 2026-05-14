// Module-level state — safe because this composable is client-only.
// A single shared instance is correct: there is only ever one active title popup.
let _showTimeout: ReturnType<typeof setTimeout> | undefined;
const SHOW_DELAY = 400;
const anchor = shallowRef<HTMLElement>();
const label = ref('');
const visible = ref(false);
const popupClass = ref('');

export function useTitlePopup() {
  function show(el: HTMLElement, text: string, extraClass: string = '') {
    clearTimeout(_showTimeout);
    anchor.value = el;
    label.value = text;
    popupClass.value = extraClass;
    _showTimeout = setTimeout(() => {
      visible.value = true;
    }, SHOW_DELAY);
  }

  function hide() {
    clearTimeout(_showTimeout);
    visible.value = false;
  }

  return { anchor, label, visible, popupClass, show, hide };
}
