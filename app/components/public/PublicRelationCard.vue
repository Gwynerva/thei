<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicEntityLink,
} from '#layers/thei/shared/api/public';
import type { RelationEntityType } from '#layers/thei/shared/relation';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';
import TheiLink from '../TheiLink';

/**
 * One related entity on a public page, in the relations block: its name,
 * and under it what the relation says — its direction, if it has one, run
 * into the owner's reason, or else what the entity says of itself — over its
 * picture, which fills the card from the right edge.
 *
 * A smaller sibling of a search result, drawn the same way: the words keep
 * to the left three quarters with a halo of the card's colour, and under the
 * pointer the card lifts and takes its picture's accent. Whatever it cuts
 * short is in its popup in full. A secret is its codename and its generated
 * icon, never a link.
 */
const { link, kind } = defineProps<{
  link: PublicEntityLink;
  /** The kind the list is of, for a secret that does not say its own. */
  kind: RelationEntityType;
}>();

const { engaged, events: mediaEvents } = useMediaInteraction();

const secret = computed(() => isPublicSecret(link));
const entityType = computed(() => link.entityType ?? kind);
const href = computed(() => (isPublicSecret(link) ? undefined : link.href));
const accent = computed(() =>
  imageAccentCssColor(link.iconMedia?.accent, 'var(--color-accent)'),
);

/** A diary entry is called by its day. */
const title = computed(() =>
  publicText(
    !isPublicSecret(link) && link.date
      ? entityDisplayTitle(
          { title: link.title, date: link.date },
          'abbreviated',
        )
      : link.title,
  ),
);

const note = computed(() =>
  !isPublicSecret(link) && link.note ? publicText(link.note) : '',
);
const summary = computed(() => publicText(link.summary));
const isDiary = computed(() => entityType.value === 'diary-entry');
const relationType = computed(() => link.relationType ?? 'related');

/** The second line: the reason, or else what the entity says of itself. */
const text = computed(() => note.value || summary.value);
const italic = computed(
  () => Boolean(note.value) || isDiary.value || secret.value,
);

/** Everything the card says, in full, only when the card had to cut it. */
const popup = computed(() => ({
  ...titlePopup(
    { text: title.value, bold: true },
    text.value && { text: text.value, italic: italic.value },
  ),
  'data-title-popup-clipped': '',
}));
</script>

<template>
  <component
    :is="href ? TheiLink : 'div'"
    v-on="mediaEvents"
    :to="href"
    v-bind="popup"
    class="relation-card group relative isolate flex min-h-14 min-w-0
      items-center overflow-hidden rounded-normal border border-border-1 bg-bg-2
      text-text-1 no-underline shadow-md shadow-shadow-1"
    :class="{
      [`relation-card-link transition focus-visible:ring-2
      focus-visible:ring-accent focus-visible:outline-none hocus:shadow-lg
      motion-safe:hocus:-translate-y-px`]: href,
    }"
    :style="{
      '--relation-card-accent': accent,
      '--relation-card-shadow': `color-mix(in oklab, ${accent} 26%, transparent)`,
    }"
    :data-public-secret="secret || undefined"
    data-relation-card
  >
    <MediaEdge
      :media="link.iconMedia"
      side="right"
      fade="card"
      playback="interaction"
      :engaged
      media-class="opacity-75 transition duration-300 group-hocus:opacity-90
        group-has-focus-visible:opacity-90 motion-reduce:duration-150"
      class="w-full"
      data-relation-media
    >
      <span
        class="flex size-full items-center justify-end pr-md text-4xl
          text-text-3/25"
      >
        <Icon :name="relationEntityIcon(entityType)" />
      </span>
    </MediaEdge>
    <!-- The words keep to the left three quarters, clear of where the picture
         stays sharp, and carry a halo where they reach over the rest of it;
         a truncated line gets room for its halo, or it draws a seam. -->
    <span
      class="relation-card-text relative z-1 flex max-w-4/5 min-w-0 flex-col
        gap-0.5 px-sm py-xs text-xs sm:max-w-3/4"
      data-relation-text
    >
      <span
        class="-mx-[0.75em] truncate px-[0.75em] font-semibold
          transition-colors"
        :class="secret ? 'text-text-2 italic' : 'group-hocus:text-accent'"
        data-title-popup-clip
        data-relation-title
        >{{ title }}</span
      >
      <RelationLine
        v-if="relationType !== 'related' || text"
        :type="relationType"
        :text="text"
        :italic
        class="-mx-[0.75em] line-clamp-2 px-[0.75em] leading-relaxed
          text-text-2"
        data-title-popup-clip
      />
    </span>
  </component>
</template>

<style scoped>
.relation-card-text {
  text-shadow:
    0 0 0.55em var(--color-bg-2),
    0 0 0.9em var(--color-bg-2),
    0 0.1em 0.45em var(--color-bg-2);
}

.relation-card-link:is(:focus-visible, :has(:focus-visible)) {
  border-color: var(--relation-card-accent);
  --tw-shadow-color: var(--relation-card-shadow);
}

@media (hover: hover) {
  .relation-card-link:hover {
    border-color: var(--relation-card-accent);
    --tw-shadow-color: var(--relation-card-shadow);
  }
}
</style>
