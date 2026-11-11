<script lang="ts" setup>
import type { MediaDescriptor, MediaPlayback } from '#layers/thei/shared/media';
import type {
  ContentEntityParent,
  ContentEntityType,
} from '#layers/thei/shared/content-link';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import LinkPreviewCard from '#layers/thei/app/components/LinkPreviewCard.vue';

/**
 * The card of a link to one of the site's own entities (`LinkPreviewCard`).
 *
 * Its title follows the glyph of its kind, and a line over it names what
 * the entity belongs to: a section's project, since "Launch" alone does not
 * say whose launch it was, an excerpt's parent. A diary entry is titled by
 * its day and quotes its opening lines in italics, as its own card on the
 * timeline does.
 */
const props = defineProps<{
  entityType: ContentEntityType;
  title: string;
  summary: string;
  /** The owner's note, as typed. */
  note?: string;
  /** The day of a diary entry; formatted in place of the title. */
  date?: string;
  /** The project a section belongs to; the parent of an excerpt. */
  parent?: Pick<ContentEntityParent, 'type' | 'title' | 'date'>;
  iconMedia?: MediaDescriptor;
  /** The entity's own colour, as a tag has one: the card's accent. */
  accent?: string;
  href?: string;
  interactive: boolean;
  playback?: MediaPlayback;
  /** Laid on a popup's surface: no border or ground of its own. */
  flush?: boolean;
  /** For a narrow popup: a thinner picture, so the text keeps its room. */
  compact?: boolean;
  loop?: boolean;
  autoplayReducedMotion?: boolean;
}>();
const slots = defineSlots<{ note?(): unknown }>();
const kind = computed(() => ({
  icon: entityTypeIcon(props.entityType),
  label: entityTypeLabel(props.entityType),
}));
const parentLine = computed(() =>
  props.parent ? entityParentLine(props.parent) : undefined,
);
const heading = computed(() => publicText(entityDisplayTitle(props)));
</script>

<template>
  <LinkPreviewCard
    class="entity-link-preview"
    :kind
    :parents="parentLine ? [parentLine] : undefined"
    :title="heading"
    :summary="publicText(summary)"
    :summary-italic="Boolean(date)"
    :note
    :media="iconMedia"
    :accent
    :href
    :interactive
    :playback
    :flush
    :compact
    :loop
    :autoplay-reduced-motion
  >
    <template v-if="slots.note" #note><slot name="note" /></template>
  </LinkPreviewCard>
</template>
