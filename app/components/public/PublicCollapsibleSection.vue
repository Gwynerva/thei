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
        class="shrink-0 text-text-3 transition-transform duration-250
          group-open/collapsible:rotate-90 motion-reduce:transition-none"
      />
    </summary>
    <div class="min-h-0 overflow-hidden">
      <div class="pt-xs"><slot /></div>
    </div>
  </details>
</template>

<style scoped>
summary::-webkit-details-marker {
  display: none;
}

details::details-content {
  display: grid;
  grid-template-rows: 0fr;
  overflow: clip;
  transition:
    grid-template-rows 0.25s ease-out,
    content-visibility 0.25s allow-discrete;
}
details[open]::details-content {
  grid-template-rows: 1fr;
}
@supports (interpolate-size: allow-keywords) {
  details::details-content {
    interpolate-size: allow-keywords;
    grid-template-rows: 1fr;
    height: 0;
    transition:
      height 0.25s ease-out,
      content-visibility 0.25s allow-discrete;
  }
  details[open]::details-content {
    height: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  details::details-content {
    transition: none;
  }
}
</style>
