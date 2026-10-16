<script lang="ts" setup>
import type { EditorToolboxEntry } from '#layers/thei/app/composables/editor-block-toolbox';

/**
 * The blocks the "+" of the editor offers: a grid of tiles, each a block's
 * icon, its name in a hint — on hover, on focus, on a long press. The arrows
 * go across and down, Home and End to the ends, a letter to the next block
 * whose name starts with it, Enter puts it in. The tiles are rearranged by
 * dragging, or by the arrows with Alt; the order is the owner's, kept in
 * this browser.
 */
const props = defineProps<{ entries: readonly EditorToolboxEntry[] }>();
const emit = defineEmits<{
  pick: [entry: EditorToolboxEntry];
  reorder: [keys: string[]];
}>();

const COLUMNS = 4;
/** The one tile Tab stops on; the arrows move it. */
const current = ref(0);
const grid = useTemplateRef<HTMLElement>('grid');
const keys = computed(() => props.entries.map((entry) => entry.key));

const { guardClick } = useDragSort(grid, {
  onDrop: ({ id, newIndex }) =>
    emit(
      'reorder',
      moveItemById(keys.value, id, newIndex, (key) => key),
    ),
});

function tiles() {
  return [
    ...(grid.value?.querySelectorAll<HTMLElement>('[data-block-tile]') ?? []),
  ];
}

function focusTile(index: number) {
  const all = tiles();
  current.value = Math.max(0, Math.min(all.length - 1, index));
  all[current.value]?.focus();
}

function onKeydown(event: KeyboardEvent, index: number) {
  const count = props.entries.length;
  const step =
    {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: COLUMNS,
      ArrowUp: -COLUMNS,
    }[event.key] ?? 0;
  if (step && event.altKey) {
    // The tile moves, and the focus with it.
    event.preventDefault();
    const to = index + step;
    if (to < 0 || to >= count) return;
    emit(
      'reorder',
      moveItemById(keys.value, keys.value[index]!, to, (key) => key),
    );
    void nextTick(() => focusTile(to));
    return;
  }
  if (step) {
    event.preventDefault();
    focusTile(index + step);
    return;
  }
  if (event.key === 'Home' || event.key === 'End') {
    event.preventDefault();
    focusTile(event.key === 'Home' ? 0 : count - 1);
    return;
  }
  // A letter: the next block whose name starts with it.
  if (
    event.key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    /\p{L}/u.test(event.key)
  ) {
    const letter = event.key.toLocaleLowerCase();
    for (let offset = 1; offset <= count; offset++) {
      const at = (index + offset) % count;
      if (props.entries[at]!.title.toLocaleLowerCase().startsWith(letter)) {
        event.preventDefault();
        focusTile(at);
        return;
      }
    }
  }
}

defineExpose({ focus: () => focusTile(0) });
</script>

<template>
  <div data-block-toolbox>
    <!--
      Tiles fade their colours and ring only: Sortable slides a moved tile with
      a transform of its own, which a transition of transforms would undo.
    -->
    <div
      ref="grid"
      role="group"
      :aria-label="phrase.content_block_toolbox"
      class="grid grid-cols-4 gap-1"
    >
      <button
        v-for="(entry, index) in entries"
        :key="entry.key"
        type="button"
        :data-drag-id="entry.key"
        :data-block-tile="entry.key"
        :aria-label="entry.title"
        :data-title-popup="entry.title"
        :tabindex="index === current ? 0 : -1"
        class="grid size-11 cursor-pointer place-items-center rounded-sm bg-bg-1
          text-text-2 transition-[color,background-color,box-shadow] select-none
          focus-visible:ring-2 focus-visible:ring-accent
          focus-visible:outline-none focus-visible:ring-inset
          pointer-coarse:size-13 hocus:bg-accent/15 hocus:text-accent
          [&_svg]:pointer-events-none"
        @keydown="onKeydown($event, index)"
        @focus="current = index"
        @click="guardClick(() => emit('pick', entry))"
        v-html="entry.icon"
      ></button>
    </div>
  </div>
</template>
