<script lang="ts" setup generic="T">
import type { IconName } from '#thei/icons';
import type { PublicReferenceSplit } from '#layers/thei/shared/api/public';

const props = defineProps<{ split: PublicReferenceSplit<T> }>();
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
</script>

<template>
  <div class="flex min-w-0 flex-col gap-sm">
    <slot v-if="split.shared.length" :items="split.shared" />
    <div
      v-for="group in groups"
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
  </div>
</template>
