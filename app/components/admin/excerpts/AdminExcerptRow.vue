<script lang="ts" setup>
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { excerptSubjectLimit } from '#layers/thei/shared/excerpt';
import type { RelationEditItem } from '#layers/thei/shared/relation';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';
import { imageAccentCssColor } from '#layers/thei/shared/accent-color';

/**
 * One excerpt in its parent's form: its name, with a lock before it when
 * only the owner sees it — marked so, or about something private — its
 * summary, and, over its name, what it is about in the archive, the way its
 * public page says it — where a section's row has its dates — over its banner or the first picture of its text,
 * which fills the row from the right edge. An excerpt about nothing, left so
 * by a deleted target, says so until the owner says what it is about.
 *
 * A row of a list that is dragged into order has its grip along the whole
 * left edge, pale until the pointer comes near. Removing an excerpt is left
 * to its modal: it takes the excerpt's text and files with it.
 */
const { title, summary, about, media, isPrivate } = defineProps<{
  title: string;
  summary: string;
  about: RelationEditItem | null;
  media?: MediaDescriptor;
  isPrivate: boolean;
}>();
defineEmits<{ open: []; move: [direction: -1 | 1] }>();

const { engaged, events: mediaEvents } = useMediaInteraction();
/** What closes the excerpt to visitors, said by its lock: its flag, or what it is about. */
const lockWords = computed(() =>
  isPrivate
    ? phrase.value.excerpt_private
    : about &&
        excerptSubjectLimit(about.access) === ProjectEventAccessLevel.Private
      ? phrase.value.excerpt_hidden_by_subject(entityListName(about))
      : undefined,
);
/** The note of the relation as the excerpt's side reads it. */
const aboutNote = computed(() => {
  const note = about?.note;
  if (!note) return undefined;
  return note.type === 'split' ? note.currentText : note.text;
});
const accent = computed(() =>
  imageAccentCssColor(media?.accent, 'var(--color-accent)'),
);
</script>

<template>
  <div
    v-on="mediaEvents"
    class="excerpt-row group relative isolate flex min-h-16 items-stretch
      overflow-hidden rounded-normal border border-border-1 bg-bg-3
      transition-colors has-[[data-excerpt-open]:focus-visible]:ring-2
      has-[[data-excerpt-open]:focus-visible]:ring-accent"
    :style="{ '--excerpt-accent': accent }"
    data-excerpt-row
  >
    <MediaEdge
      v-if="media"
      :media
      side="right"
      fade="card"
      playback="interaction"
      :engaged
      media-class="opacity-75 transition duration-300 group-hocus:opacity-90
        group-has-focus-visible:opacity-90 motion-reduce:duration-150"
      class="w-full"
      data-excerpt-media
    />
    <button
      type="button"
      class="relative z-1 flex w-7 shrink-0 cursor-grab items-center
        justify-center self-stretch text-lg text-text-3/50 transition-colors
        group-hocus:text-text-3 focus-visible:ring-2 focus-visible:ring-accent
        focus-visible:outline-none focus-visible:ring-inset
        active:cursor-grabbing hocus:text-accent"
      :aria-label="`${phrase.excerpt_sort}: ${publicText(title)}`"
      data-excerpt-handle
      @keydown.up.prevent.stop="$emit('move', -1)"
      @keydown.down.prevent.stop="$emit('move', 1)"
    >
      <Icon name="grip" />
    </button>
    <button
      type="button"
      class="relative z-1 flex min-w-0 flex-1 cursor-pointer flex-col
        justify-center py-sm pr-sm text-left focus-visible:outline-none"
      data-excerpt-open
      @click="$emit('open')"
    >
      <!-- The words keep to the left of where the picture stays sharp, with
           a halo of the row's ground where they reach over the rest of it. -->
      <span
        class="flex min-w-0 flex-col gap-1 text-halo-bg-3"
        :class="media ? 'max-w-4/5 sm:max-w-3/4' : undefined"
      >
        <!-- What it is about over its title, as on the public page: the
             entity, the relation's word when it has a direction and the
             start of its note, and the arrow turning down to the title. -->
        <span
          class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
          data-excerpt-about
        >
          <template v-if="about">
            <span
              class="inline-flex max-w-full min-w-0 items-center gap-1
                font-semibold text-text-2"
            >
              <EntityTokenIcon
                :media="about.iconMedia"
                :icon="relationEntityIcon(about.entityType)"
                class="size-4"
              />
              <span class="min-w-0 truncate">{{
                entityListName(about, 'abbreviated')
              }}</span>
            </span>
            <PublicRelationInline :type="about.type" :note="aboutNote" />
            <Icon
              name="subfolder-arrow"
              class="shrink-0 translate-y-[12%]
                [transform:rotate(90deg)_scaleY(-1)] text-text-3"
              aria-hidden="true"
            />
          </template>
          <span
            v-else
            class="inline-flex items-center gap-1 text-text-warning italic"
            :data-title-popup="phrase.excerpt_without_about_hint"
            data-excerpt-orphan
          >
            <Icon name="warning" aria-hidden="true" />
            {{ phrase.excerpt_without_about }}
          </span>
        </span>
        <span
          class="line-clamp-2 leading-snug font-semibold wrap-break-word
            transition-colors
            group-has-[[data-excerpt-open]:focus-visible]:text-accent
            group-hocus:text-accent"
          data-excerpt-title
          ><span
            v-if="lockWords"
            class="mr-1 text-accent"
            :data-title-popup="lockWords"
            data-excerpt-private
            ><Icon name="lock-close" aria-hidden="true" /><span class="sr-only"
              >{{ lockWords }}
            </span></span
          >{{ publicText(title) }}</span
        >
        <span
          v-if="summary"
          class="line-clamp-2 text-sm wrap-break-word text-text-2"
        >
          {{ publicText(summary) }}
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.excerpt-row:has(:focus-visible) {
  border-color: color-mix(in oklab, var(--excerpt-accent) 80%, transparent);
}

@media (hover: hover) {
  .excerpt-row:hover {
    border-color: color-mix(in oklab, var(--excerpt-accent) 80%, transparent);
  }
}
</style>
