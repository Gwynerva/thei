<script lang="ts" setup>
/**
 * The place inside its target a link leads to — the `#…` of the address it
 * was made from — shown where the link is edited, so a kept anchor is seen
 * and can be let go of. A reader never sees it: for them it is only the end
 * of the address the link opens.
 */
const props = defineProps<{ fragment: string; removable?: boolean }>();
const emit = defineEmits<{ remove: [] }>();

/** Read as it was typed: `%D0%B3%D0%BB%D0%B0%D0%B2%D0%B0` is «глава». */
const label = computed(() => {
  try {
    return decodeURIComponent(props.fragment);
  } catch {
    return props.fragment;
  }
});
</script>

<template>
  <span
    data-link-fragment
    class="inline-flex h-7 max-w-full min-w-0 items-center gap-1 self-start
      rounded-sm border border-border-1 bg-bg-3 pl-xs text-xs leading-none
      font-semibold text-text-2"
    :class="removable ? 'pr-1' : 'pr-xs'"
  >
    <span
      class="flex min-w-0 items-center gap-0.5"
      :data-title-popup="phrase.content_link_fragment"
      ><span class="sr-only">{{ phrase.content_link_fragment }}: </span
      ><span class="shrink-0 text-accent" aria-hidden="true">#</span
      ><span class="min-w-0 truncate">{{ label }}</span></span
    >
    <button
      v-if="removable"
      type="button"
      class="shrink-0 cursor-pointer rounded-sm leading-none transition
        focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:outline-none hocus:text-text-error"
      :aria-label="phrase.content_link_fragment_remove"
      :data-title-popup="phrase.content_link_fragment_remove"
      @click="emit('remove')"
    >
      <Icon name="close" />
    </button>
  </span>
</template>
