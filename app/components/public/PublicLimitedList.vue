<script lang="ts" setup generic="T">
/**
 * A sidebar list that shows its beginning until it is asked for in full:
 * files and links read the same way because they both come through here.
 */
const props = withDefaults(
  defineProps<{
    items: T[];
    /** How many items a sidebar section shows before it asks to be expanded. */
    limit?: number;
  }>(),
  { limit: 7 },
);
defineSlots<{ default(props: { items: T[] }): unknown }>();

const expanded = ref(false);
const collapsed = computed(
  () => !expanded.value && props.items.length > props.limit,
);
const shown = computed(() =>
  collapsed.value ? props.items.slice(0, props.limit) : props.items,
);
// A find of the search lands on a file or a link the list may hold past its
// beginning: it is shown in full.
useLandingReveal((target) => {
  if (target.file || target.link) expanded.value = true;
});
</script>

<template>
  <div class="flex min-w-0 flex-col gap-sm">
    <slot :items="shown" />
    <button
      v-if="collapsed"
      type="button"
      class="cursor-pointer self-start px-1 text-xs font-semibold text-accent
        transition hocus:underline"
      @click="expanded = true"
    >
      {{ phrase.public_details_show_all(items.length) }}
    </button>
  </div>
</template>
