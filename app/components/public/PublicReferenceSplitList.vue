<script lang="ts" setup generic="T">
import type { IconName } from '#thei/icons';
import type { PublicReferenceSplit } from '#layers/thei/shared/api/public';
import { publicReferenceSplitSize } from '#layers/thei/shared/public-references';

const props = withDefaults(
  defineProps<{
    split: PublicReferenceSplit<T>;
    /** How many items a sidebar section shows before it asks to be expanded. */
    limit?: number;
  }>(),
  { limit: 7 },
);
defineSlots<{ default(props: { items: T[] }): unknown }>();

const groups = computed(() =>
  (
    [
      {
        key: 'manual',
        icon: 'edit',
        title: phrase.value.public_details_manual,
        items: props.split.manual,
      },
      {
        key: 'content',
        icon: 'text',
        title: phrase.value.public_details_from_content,
        items: props.split.content,
      },
    ] satisfies { key: string; icon: IconName; title: string; items: T[] }[]
  ).filter((group) => group.items.length),
);
// A lone subgroup needs no name: it simply continues the shared list.
const titled = computed(() => groups.value.length > 1);

/**
 * A long list is cut short until it is asked for in full. The cut runs across
 * the subgroups in the order they are shown, so what is visible is always the
 * beginning of the same list rather than a few items out of each group.
 */
const total = computed(() => publicReferenceSplitSize(props.split));
const expanded = ref(false);
const collapsed = computed(() => !expanded.value && total.value > props.limit);

function cut(before: number, items: T[]): T[] {
  if (!collapsed.value) return items;
  return items.slice(0, Math.max(0, props.limit - before));
}

const sharedItems = computed(() => cut(0, props.split.shared));
const groupsShown = computed(() => {
  let used = props.split.shared.length;
  return groups.value
    .map((group) => {
      const items = cut(used, group.items);
      used += group.items.length;
      return { ...group, items };
    })
    .filter((group) => group.items.length);
});
</script>

<template>
  <div class="flex min-w-0 flex-col gap-sm">
    <slot v-if="sharedItems.length" :items="sharedItems" />
    <div
      v-for="group in groupsShown"
      :key="group.key"
      class="flex min-w-0 flex-col gap-xs"
    >
      <div
        v-if="titled"
        class="flex items-center gap-xs px-1 text-xs font-semibold text-text-3"
      >
        <Icon :name="group.icon" class="shrink-0" aria-hidden="true" />
        <span>{{ group.title }}</span>
        <span class="h-px min-w-0 flex-1 bg-border-1" aria-hidden="true" />
      </div>
      <slot :items="group.items" />
    </div>
    <button
      v-if="collapsed"
      type="button"
      class="cursor-pointer self-start px-1 text-xs font-semibold text-accent
        transition hocus:underline"
      @click="expanded = true"
    >
      {{ phrase.public_details_show_all(total) }}
    </button>
  </div>
</template>
