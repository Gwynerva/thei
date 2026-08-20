<script lang="ts" setup>
const isAdmin = useIsAdmin();
const { progress, isLoading, error } = useLoadingIndicator();
const stickyHeaderContext = useStickyHeaderContext();
const top = computed(() => {
  const base = isAdmin.value ? 'var(--height-admin-bar)' : '0px';
  const headerHeight = stickyHeaderContext?.height.value ?? 0;
  return `calc(${base} + ${headerHeight}px)`;
});
</script>

<template>
  <div
    class="pointer-events-none fixed left-0 z-20 h-0 w-full"
    :style="{ top }"
  >
    <TransitionFade>
      <div
        v-if="isLoading"
        :style="`--_progress: ${progress}%; --_color: ${error ? 'var(--color-text-error)' : 'var(--color-accent)'};`"
        class="absolute top-0 left-0 z-9999 h-1 w-(--_progress) bg-linear-to-r
          from-(--_color)/50 to-(--_color) shadow-lg shadow-(color:--_color)
          transition-all"
      ></div>
    </TransitionFade>
  </div>
</template>
