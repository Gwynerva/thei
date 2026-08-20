<script lang="ts" setup>
defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{ top?: string }>(), { top: '0px' });
const attrs = useAttrs();
const stuck = ref(false);
const sentinel = useTemplateRef<HTMLElement>('sentinel');
const sticky = useTemplateRef<HTMLElement>('sticky');
let observer: IntersectionObserver | undefined;
let resizeFrame: number | undefined;

function observe() {
  observer?.disconnect();
  observer = undefined;

  if (!sentinel.value || !sticky.value) return;
  const computedTop = Number.parseFloat(getComputedStyle(sticky.value).top);
  const top = Number.isFinite(computedTop) ? Math.max(0, computedTop) : 0;

  observer = new IntersectionObserver(
    ([entry]) => {
      stuck.value = !entry?.isIntersecting;
    },
    {
      threshold: 0,
      rootMargin: `-${top}px 0px 0px 0px`,
    },
  );
  observer.observe(sentinel.value);
}

function scheduleObserve() {
  if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined;
    observe();
  });
}

onMounted(() => {
  observe();
  window.addEventListener('resize', scheduleObserve, { passive: true });
});

watch(() => props.top, scheduleObserve);

onBeforeUnmount(() => {
  observer?.disconnect();
  window.removeEventListener('resize', scheduleObserve);
  if (resizeFrame !== undefined) cancelAnimationFrame(resizeFrame);
});
</script>

<template>
  <div ref="sentinel" class="h-0"></div>
  <div
    ref="sticky"
    v-bind="attrs"
    class="sticky"
    :style="[{ top: props.top }, attrs.style]"
    :data-sticky-stuck="stuck ? '' : undefined"
  >
    <slot></slot>
  </div>
</template>
