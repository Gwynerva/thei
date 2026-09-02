<script lang="ts" setup>
withDefaults(defineProps<{ title: string; open?: boolean }>(), { open: true });
</script>

<template>
  <details :open="open" class="group/collapsible min-w-0">
    <summary
      class="flex w-full cursor-pointer list-none items-center justify-between
        gap-xs rounded-sm py-1 text-sm font-semibold text-text-2 transition
        focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:outline-none hocus:text-text-1"
    >
      <span>{{ title }}</span>
      <Icon
        name="chevron-right"
        aria-hidden="true"
        class="shrink-0 text-text-3 transition-transform
          group-open/collapsible:rotate-90 motion-reduce:transition-none"
      />
    </summary>
    <div class="pt-xs"><slot /></div>
  </details>
</template>

<style scoped>
summary::-webkit-details-marker {
  display: none;
}
</style>
