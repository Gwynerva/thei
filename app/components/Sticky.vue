<script lang="ts" setup>
defineOptions({ inheritAttrs: false });

const attrs = useAttrs();
const stuck = ref(false);
const sentinel = useTemplateRef('sentinel');

onMounted(() => {
  const observer = new IntersectionObserver(
    ([entry]) => {
      stuck.value = !entry?.isIntersecting;
    },
    { threshold: 0 },
  );

  if (sentinel.value) {
    observer.observe(sentinel.value);
  }
});
</script>

<template>
  <div ref="sentinel" class="h-0"></div>
  <div
    v-bind="attrs"
    class="sticky"
    :data-sticky-stuck="stuck ? '' : undefined"
  >
    <slot></slot>
  </div>
</template>
