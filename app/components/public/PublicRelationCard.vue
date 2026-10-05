<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicEntityLink,
} from '#layers/thei/shared/api/public';
import type { RelationEntityType } from '#layers/thei/shared/relation';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';
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

const secret = computed(() => isPublicSecret(link));
const entityType = computed(() => link.entityType ?? kind);
const href = computed(() => (isPublicSecret(link) ? undefined : link.href));

/** A diary entry is called by its day. */
const title = computed(() =>
  entityListName(
    isPublicSecret(link) ? { title: link.title } : link,
    'abbreviated',
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
  <MediaEdgeCard
    :as="href ? TheiLink : 'div'"
    :to="href"
    :media="link.iconMedia"
    :interactive="Boolean(href)"
    v-bind="popup"
    class="min-h-14 items-center"
    :data-public-secret="secret || undefined"
    data-relation-card
  >
    <template #fallback>
      <span
        class="flex size-full items-center justify-end pr-md text-4xl
          text-text-3/25"
      >
        <Icon :name="relationEntityIcon(entityType)" />
      </span>
    </template>
    <!-- The words keep to the left three quarters, clear of where the picture
         stays sharp, and carry a halo where they reach over the rest of it;
         a truncated line gets room for its halo, or it draws a seam. -->
    <span
      class="relative z-1 flex max-w-4/5 min-w-0 flex-col gap-0.5 px-sm py-xs
        text-xs text-halo-bg-2 sm:max-w-3/4"
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
  </MediaEdgeCard>
</template>
