<script lang="ts" setup>
import type {
  PublicExcerptCard,
  PublicExcerptsAbout,
  PublicExcerptsPage,
} from '#layers/thei/shared/api/public';
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';
import { publicDatePrecisionOptions } from '#layers/thei/app/composables/public-date';

/**
 * The excerpts of other entities about a page's entity, after its own
 * parts and before what it is related to: each a card torn off its parent,
 * newest first, a page at a time, the way the relations block fetches its
 * lists. The page carries only how many there are; the first page comes
 * with it, the rest as the reader asks. Where the rest is read elsewhere —
 * a project's chronology — the block shows the latest and leads there
 * (`allHref`).
 */
const { about, url, allHref } = defineProps<{
  /** The kind of entity whose page this is: the description names it. */
  entity: 'project' | 'event' | 'diary-entry';
  about: PublicExcerptsAbout;
  /** The entity's own `…/excerpts` address. */
  url: string;
  /** Where all of them are read, in place of loading more here. */
  allHref?: string;
}>();

const { data: page, status } = await useFetch<PublicExcerptsPage>(url, {
  key: `excerpts:${url}`,
  query: { page: 1 },
  immediate: about.total > 0,
});
const loading = computed(() => status.value === 'pending');

/** Pages past the first, appended as they are asked for. */
const extra = ref<PublicExcerptCard[]>([]);
const nextPage = ref(2);
const loadingMore = ref(false);
const moreError = ref(false);
const more = computed(() => (page.value?.pageCount ?? 0) >= nextPage.value);

async function loadMore() {
  if (!more.value || loadingMore.value) return;
  loadingMore.value = true;
  moreError.value = false;
  try {
    const loaded = await $fetch<PublicExcerptsPage>(url, {
      query: { page: nextPage.value },
    });
    extra.value = [...extra.value, ...loaded.items];
    nextPage.value += 1;
  } catch {
    moreError.value = true;
  } finally {
    loadingMore.value = false;
  }
}

const items = computed(() => [...(page.value?.items ?? []), ...extra.value]);

/** The parent of a card, named as a card names what its subject belongs to. */
function parentOf(card: PublicExcerptCard) {
  return {
    entityType: card.parent.type,
    title: card.parent.title,
    summary: card.parent.summary,
    href: card.parent.href,
    ...(card.parent.media ? { iconMedia: card.parent.media } : {}),
    ...(card.parent.date ? { date: card.parent.date } : {}),
  };
}

/**
 * A card's day in words, as its parent's day is said beside it: the compact
 * card would write it in numbers, and two cards in one list would then date
 * themselves two ways.
 */
function dateOf(card: PublicExcerptCard) {
  return card.date
    ? getPublicDatePresentation(card.date, language.value.code, new Date(), {
        style: 'long',
        ...publicDatePrecisionOptions(),
      })
    : undefined;
}
</script>

<script lang="ts">
import { PUBLIC_EXCERPTS_ABOUT_ID } from '#layers/thei/shared/content-headings';

/** The anchor the table of contents points at. */
export { PUBLIC_EXCERPTS_ABOUT_ID };

/** The entry this block adds to the table of contents. */
export function publicExcerptsHeading(title: string): ContentHeading {
  return {
    title,
    level: 2,
    id: PUBLIC_EXCERPTS_ABOUT_ID,
    href: `#${PUBLIC_EXCERPTS_ABOUT_ID}`,
    path: PUBLIC_EXCERPTS_ABOUT_ID,
    icon: 'excerpt',
  };
}
</script>

<template>
  <section
    v-if="about.total"
    :id="PUBLIC_EXCERPTS_ABOUT_ID"
    aria-labelledby="excerpts-about-heading"
    class="flex scroll-mt-[var(--public-anchor-offset,8rem)] flex-col gap-sm"
  >
    <!-- Not the entity's own excerpts, which are read in its text and named
         in its contents: these were written elsewhere, about it. -->
    <PublicSectionHeader
      heading-id="excerpts-about-heading"
      :title="phrase.excerpts"
      :description="phrase.excerpts_about_description(entity)"
      icon="excerpt"
    />
    <p v-if="loading" class="text-sm text-text-3">
      <Icon name="loading" class="mr-xs" />{{ phrase.life_activity_loading }}
    </p>
    <template v-else>
      <!-- The teeth of the cards reach past their boxes: room between them.
           A card names no kind: the block's heading has said it. -->
      <div class="flex min-w-0 flex-col gap-md">
        <PublicContentCard
          v-for="card in items"
          :key="card.href"
          :href="card.href"
          :title="card.title"
          :summary="card.summary"
          :date="card.date ?? ''"
          :date-presentation="dateOf(card)"
          :hide-date="!card.date || card.parent.type === 'diary-entry'"
          :media="card.media"
          :parent="parentOf(card)"
          :relation="
            card.relationType
              ? { type: card.relationType, note: card.note }
              : undefined
          "
          torn
          compact
          data-excerpt-card
        />
      </div>
      <Button
        v-if="allHref"
        v-show="about.total > items.length"
        :to="allHref"
        variant="secondary"
        class="flex min-h-10 w-full items-center justify-center gap-xs
          font-semibold sm:w-auto sm:self-start"
        data-excerpts-all
      >
        {{ phrase.view_all }}
      </Button>
      <Button
        v-else-if="more"
        type="button"
        variant="secondary"
        :disabled="loadingMore"
        class="flex min-h-10 w-full items-center justify-center gap-xs
          font-semibold sm:w-auto sm:self-start"
        data-excerpts-more
        @click="loadMore"
      >
        <Icon v-if="loadingMore" name="loading" />
        <span v-else>{{
          moreError ? phrase.profile_load_error : phrase.profile_more
        }}</span>
      </Button>
    </template>
  </section>
</template>
