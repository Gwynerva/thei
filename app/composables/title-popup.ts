// Module-level state — safe because this composable is client-only.
// A single shared instance is correct: there is only ever one active title popup.
let _showTimeout: ReturnType<typeof setTimeout> | undefined;
const SHOW_DELAY = 400;
// When already visible, debounce anchor switches to absorb sub-pixel browser
// hit-test oscillation at element boundaries.
const SWITCH_DEBOUNCE = 60;
const anchor = shallowRef<HTMLElement>();
const label = ref('');
const visible = ref(false);
const popupClass = ref('');

export function useTitlePopup() {
  function show(el: HTMLElement, text: string, extraClass: string = '') {
    clearTimeout(_showTimeout);

    if (visible.value && el !== anchor.value) {
      // Popup already showing — debounce the anchor switch so rapid boundary
      // oscillation from the browser doesn't cause the popup to flicker.
      _showTimeout = setTimeout(() => {
        anchor.value = el;
        label.value = text;
        popupClass.value = extraClass;
      }, SWITCH_DEBOUNCE);
      return;
    }

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
    anchor.value = undefined;
  }

  return { anchor, label, visible, popupClass, show, hide };
}
