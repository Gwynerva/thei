<script lang="ts" setup>
const isAdmin = useIsAdmin();
const { progress, isLoading, error } = useLoadingIndicator();
</script>

<template>
  <div
    class="sticky h-0 w-full"
    :class="[isAdmin ? 'top-(--height-admin-bar)' : 'top-0']"
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
