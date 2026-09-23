import { cloudOutlinePath } from '#layers/thei/shared/cloud-outline';

/**
 * A cloud outline that follows the size of an element.
 *
 * The path is empty until the element has been measured — on the server and
 * during the first paint — so whatever draws it should stay invisible until
 * then rather than guess a size.
 */
export function useCloudOutline(
  target: Readonly<Ref<Element | null | undefined>>,
  seed: MaybeRefOrGetter<string>,
) {
  const size = shallowRef<{ width: number; height: number }>();
  let observer: ResizeObserver | undefined;

  onMounted(() => {
    if (typeof ResizeObserver === 'undefined') return;
    observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (size.value?.width === width && size.value?.height === height) return;
      size.value = { width, height };
    });
    watch(
      target,
      (element, previous) => {
        if (previous) observer?.unobserve(previous);
        if (element) observer?.observe(element);
      },
      { immediate: true },
    );
  });
  onBeforeUnmount(() => observer?.disconnect());

  return computed(() =>
    size.value
      ? cloudOutlinePath(size.value.width, size.value.height, toValue(seed))
      : '',
  );
}
