import { computed, ref } from 'vue';

/** Attach these events to the entire tile, including its nested controls. */
export function useMediaInteraction() {
  const hovered = ref(false);
  const focused = ref(false);
  return {
    engaged: computed(() => hovered.value || focused.value),
    events: {
      pointerenter: (event: PointerEvent) => {
        if (event.pointerType === 'mouse') hovered.value = true;
      },
      pointerleave: () => { hovered.value = false; },
      pointercancel: () => { hovered.value = false; },
      focusin: () => { focused.value = true; },
      focusout: (event: FocusEvent) => {
        focused.value = event.relatedTarget instanceof Node &&
          (event.currentTarget as HTMLElement).contains(event.relatedTarget);
      },
    },
  };
}
