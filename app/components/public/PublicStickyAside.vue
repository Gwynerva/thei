<script lang="ts" setup>
/**
 * A desktop sidebar that sticks below the sticky bars and scrolls on its own
 * once it is taller than the room left under them. Its scrolling chains to the
 * page natively: at either end, or with nothing to scroll, the page moves on.
 */
const publicHeader = useStickyHeaderContext();
const isAdmin = useIsAdmin();
const adminOffset = computed(() =>
  isAdmin.value ? 'var(--height-admin-bar)' : '0px',
);
const publicHeaderOffset = computed(
  () => `${publicHeader?.height.value ?? 0}px`,
);
const stickyAsideStyle = computed(() => ({
  top: `calc(${adminOffset.value} + ${publicHeaderOffset.value} + var(--spacing-sm))`,
}));
const stickyContentStyle = computed(() => ({
  maxHeight: `calc(100dvh - ${adminOffset.value} - ${publicHeaderOffset.value} - var(--spacing-md))`,
}));
</script>

<template>
  <aside
    class="sticky hidden min-w-0 self-start sm:block"
    :style="stickyAsideStyle"
  >
    <div
      class="scrollbar-hover w-full min-w-0 overflow-x-clip overflow-y-auto"
      :style="stickyContentStyle"
    >
      <slot></slot>
    </div>
  </aside>
</template>
