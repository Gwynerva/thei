<script lang="ts" setup>
import type { AiEntityRef } from '#layers/thei/shared/ai';
import { isContentEntityType } from '#layers/thei/shared/content-link';

/**
 * An entity an AI names, as a chip. One of the archive's own is drawn as a
 * link in a text is — its picture along the left edge, its accent, its card
 * on hover — by the `ContentInlineLinkDecorator` of whatever holds the chip,
 * whose surface it takes from `--ai-chip-surface`. A new one, about to be
 * made, and anything that is no entry of the archive keep a plain chip: a
 * glyph and a name, leading nowhere.
 */
const props = defineProps<{
  entity?: AiEntityRef | null;
  /** For one that does not exist yet: its kind and title. */
  kind?: string;
  title?: string;
  fresh?: boolean;
}>();

const linkable = computed(
  () =>
    !props.fresh &&
    Boolean(props.entity?.id) &&
    isContentEntityType(props.entity?.type),
);

const icon = computed(() => aiEntityIcon(props.entity?.type ?? props.kind));
const label = computed(() =>
  aiEntityName({
    type: props.entity?.type ?? props.kind,
    title: props.entity?.title || props.title || props.entity?.ref || '',
  }),
);
</script>

<template>
  <span
    v-if="linkable"
    class="content-prose min-w-0 text-sm font-medium
      [--content-surface:var(--ai-chip-surface,var(--color-bg-1))]"
    data-ai-entity
    ><a
      data-content-link="entity"
      :data-entity-type="entity!.type"
      :data-entity-id="entity!.id"
      >{{ label }}</a
    ></span
  >
  <span
    v-else
    class="inline-flex h-6.5 max-w-full min-w-0 items-center gap-1 rounded-sm
      px-2 text-xs font-medium"
    :class="fresh ? 'bg-bg-accent text-accent' : 'bg-bg-3 text-text-2'"
    :data-title-popup="label"
    data-title-popup-clipped
    data-ai-entity
  >
    <Icon
      :name="icon"
      class="shrink-0 text-sm"
      :class="fresh ? 'text-accent' : 'text-text-3'"
    />
    <span class="truncate" data-title-popup-clip>{{ label }}</span>
  </span>
</template>
