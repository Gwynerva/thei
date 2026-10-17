<script lang="ts" setup>
import { contentPlaceLabel } from '#layers/thei/shared/content-headings';

/**
 * The place inside its target a link leads to — the `#…` of the address it
 * was made from — shown where the link is edited, so a kept anchor is seen
 * and can be let go of: a heading by its words, a heading no longer there as
 * gone, anything else as the address names it. A reader never sees it: for
 * them it is only the end of the address the link opens.
 */
const props = defineProps<{
  fragment: string;
  /** The words of the heading it names, once known. */
  heading?: string;
  /** The heading it named is no longer there. */
  gone?: boolean;
  removable?: boolean;
}>();
const emit = defineEmits<{ remove: [] }>();

/** Read as it was typed: `%D0%B3%D0%BB%D0%B0%D0%B2%D0%B0` is «глава». */
const label = computed(() => contentPlaceLabel(props.fragment));
const title = computed(() =>
  props.gone
    ? phrase.value.content_link_anchor_gone(label.value)
    : phrase.value.content_link_fragment,
);
</script>

<template>
  <span
    data-link-fragment
    :data-link-fragment-gone="gone || undefined"
    class="inline-flex h-7 max-w-full min-w-0 items-center gap-1 self-start
      rounded-sm border pl-xs text-xs leading-none font-semibold transition"
    :class="[
      removable ? 'pr-1' : 'pr-xs',
      gone
        ? 'border-border-warning bg-bg-warning text-text-warning'
        : 'border-border-1 bg-bg-3 text-text-2',
    ]"
  >
    <span class="flex min-w-0 items-center gap-0.5" :data-title-popup="title"
      ><span class="sr-only">{{ title }}: </span
      ><Icon
        v-if="gone"
        name="link-broken"
        class="shrink-0"
        aria-hidden="true"
      /><span v-else class="shrink-0 text-accent" aria-hidden="true">{{
        heading ? '§' : '#'
      }}</span
      ><span class="min-w-0 truncate">{{ heading ?? label }}</span></span
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
