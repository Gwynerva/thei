<script lang="ts" setup>
import type { AiEntityType } from '#layers/thei/shared/ai';
import type {
  AiMemoryEntityGroup,
  AiMemoryItem,
} from '#layers/thei/shared/ai-memory';

/**
 * One entity the AI keeps something about, as every admin list draws an
 * entity: its picture or icon dissolving from the left edge, its name over
 * it, how many records it has. It opens in place into a window with its own
 * scroll; the row itself stays where it is.
 */
const props = defineProps<{
  group: AiMemoryEntityGroup;
  open: boolean;
  /** Records forgotten a moment ago, still to be brought back. */
  hidden: Set<string>;
}>();
const emit = defineEmits<{
  toggle: [];
  forget: [item: AiMemoryItem];
  saved: [item: AiMemoryItem];
}>();

const items = computed(() =>
  props.group.items.filter((item) => !props.hidden.has(item.memoryUuid)),
);
const entity = computed(() => props.group.entity);
const kind = computed(
  () =>
    phrase.value.ai_memory_entity_kinds[
      entity.value.type as Exclude<AiEntityType, 'profile'>
    ] ?? entity.value.type,
);
/** A diary entry is called by its day, anything else by its title. */
const name = computed(() => aiEntityName(entity.value));
const panelId = useId();
const { engaged, events: mediaEvents } = useMediaInteraction();
</script>

<template>
  <div
    v-if="items.length"
    class="border-t border-border-1/70 first:border-t-0"
    :data-memory-entity="entity.ref"
  >
    <button
      type="button"
      class="group relative grid min-h-14 w-full cursor-pointer
        grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-0.5
        overflow-hidden bg-transparent py-2 pr-sm
        pl-[calc(var(--spacing-sm)+2.5rem)] text-left transition-colors
        hocus:bg-accent/6"
      :aria-expanded="open"
      :aria-controls="panelId"
      v-on="mediaEvents"
      @click="emit('toggle')"
    >
      <MediaEdge
        :media="group.media"
        playback="interaction"
        :engaged
        class="w-24"
      >
        <span class="flex size-full items-center pl-sm text-2xl text-text-3">
          <Icon :name="aiEntityIcon(entity.type)" />
        </span>
      </MediaEdge>
      <span class="relative flex min-w-0 items-baseline gap-1.5">
        <b class="min-w-0 truncate text-sm font-semibold">{{ name }}</b>
        <span class="shrink-[100] truncate text-xs text-text-3">{{
          kind
        }}</span>
      </span>
      <span class="relative col-start-1 truncate text-xs text-text-2">{{
        publicText(items[0]!.text)
      }}</span>
      <span
        class="relative col-start-2 row-span-2 row-start-1 flex items-center
          gap-1.5"
      >
        <AiCount :count="items.length" tone="neutral" />
        <Icon
          name="chevron-right"
          class="text-text-3 transition-transform motion-reduce:transition-none"
          :class="open ? '-rotate-90' : 'rotate-90'"
        />
      </span>
    </button>

    <!-- The window it opens into: its own scroll, at most 16rem. -->
    <div
      :id="panelId"
      class="grid transition-[grid-template-rows] motion-reduce:transition-none"
      :class="open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'"
      :inert="!open || undefined"
      data-memory-entity-panel
    >
      <div
        class="min-h-0 overflow-hidden bg-bg-1 shadow-[inset_0_1px_0]
          shadow-border-1/70"
        :class="{
          'scrollbar-hover max-h-64 overflow-y-auto overscroll-contain': open,
        }"
      >
        <div class="pl-3.5">
          <AiMemoryRecord
            v-for="item in items"
            :key="item.memoryUuid"
            :item
            :about="entity"
            @forget="emit('forget', item)"
            @saved="emit('saved', $event)"
          />
        </div>
        <div v-if="entity.path" class="flex justify-end px-sm pb-1.5">
          <TheiLink
            :to="entity.path"
            class="flex h-8 items-center gap-1 rounded-normal px-xs text-sm
              text-text-2 transition-colors pointer-coarse:h-11
              hocus:bg-accent/10 hocus:text-accent"
            >{{ phrase.ai_memory_open }} <Icon name="chevron-right"
          /></TheiLink>
        </div>
      </div>
    </div>
  </div>
</template>
