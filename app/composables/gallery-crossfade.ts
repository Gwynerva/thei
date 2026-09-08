import {
  computed,
  onBeforeUnmount,
  ref,
  readonly,
  shallowRef,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue';

export const GALLERY_CROSSFADE_DURATION = 300;

export function useGalleryCrossfade<T>(
  selected: MaybeRefOrGetter<T | undefined>,
  key: (item: T) => string,
) {
  const displayed = shallowRef<T>();
  const incoming = shallowRef<T>();
  const revealing = ref(false);
  const layers = computed(() => {
    const result: { item: T; role: 'displayed' | 'incoming' }[] = [];
    if (displayed.value)
      result.push({ item: displayed.value, role: 'displayed' });
    if (incoming.value) result.push({ item: incoming.value, role: 'incoming' });
    return result;
  });
  let finishTimer: ReturnType<typeof setTimeout> | undefined;

  function cancelFinish() {
    clearTimeout(finishTimer);
    finishTimer = undefined;
  }

  function finish() {
    if (!incoming.value) return;
    displayed.value = incoming.value;
    incoming.value = undefined;
    revealing.value = false;
    cancelFinish();
  }

  function settleIncoming(itemKey: string) {
    if (!incoming.value || key(incoming.value) !== itemKey) return;
    revealing.value = true;
    cancelFinish();
    finishTimer = setTimeout(finish, GALLERY_CROSSFADE_DURATION);
  }

  watch(
    () => toValue(selected),
    (next) => {
      cancelFinish();
      revealing.value = false;
      if (!next) {
        displayed.value = undefined;
        incoming.value = undefined;
        return;
      }
      if (!displayed.value) {
        displayed.value = next;
        return;
      }
      if (key(displayed.value) === key(next)) {
        displayed.value = next;
        incoming.value = undefined;
        return;
      }
      incoming.value = next;
    },
    { immediate: true },
  );

  onBeforeUnmount(cancelFinish);

  return {
    displayed,
    incoming,
    layers,
    revealing: readonly(revealing),
    settleIncoming,
  };
}
