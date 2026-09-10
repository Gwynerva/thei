<script setup lang="ts" generic="T">
const props = withDefaults(
  defineProps<{
    items: T[];
    itemKey: (item: T) => string;
    flush?: boolean;
  }>(),
  { flush: false },
);
const emit = defineEmits<{ reorder: [items: T[]]; remove: [item: T] }>();
const root = useTemplateRef<HTMLElement>('root');
useDragSort(root, {
  handle: '[data-sort-handle]',
  onDrop: ({ id, newIndex }) =>
    emit('reorder', moveItemById(props.items, id, newIndex, props.itemKey)),
});
function move(item: T, direction: number) {
  const index = props.items.indexOf(item);
  emit(
    'reorder',
    moveItemById(
      props.items,
      props.itemKey(item),
      Math.max(0, Math.min(props.items.length - 1, index + direction)),
      props.itemKey,
    ),
  );
}
</script>
<template>
  <div ref="root" class="divide-y divide-border-1">
    <div
      v-for="item in items"
      :key="itemKey(item)"
      :data-drag-id="itemKey(item)"
      class="flex items-center gap-sm"
      :class="flush ? 'min-h-14' : 'p-sm sm:p-md'"
    >
      <div class="min-w-0 flex-1" :class="flush ? 'self-stretch' : undefined">
        <slot :item="item" />
      </div>
      <Button
        type="button"
        data-sort-handle
        size="icon"
        variant="secondary"
        drag-handle
        :aria-label="phrase.profile_reorder"
        @keydown.up.prevent="move(item, -1)"
        @keydown.down.prevent="move(item, 1)"
      >
        <Icon name="grip" />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="delete"
        :class="flush ? 'mr-sm' : undefined"
        :aria-label="phrase.delete"
        @click="emit('remove', item)"
      >
        <Icon name="delete" />
      </Button>
    </div>
    <p v-if="!items.length" class="p-md text-sm text-text-3 italic">
      {{ phrase.profile_empty }}
    </p>
  </div>
</template>
