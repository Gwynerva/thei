<script lang="ts" setup>
defineOptions({ inheritAttrs: false });
</script>

<template>
  <div
    v-bind="$attrs"
    class="grid grid-cols-[2rem_minmax(0,1fr)] gap-1
      sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-sm"
  >
    <slot />
  </div>
</template>
