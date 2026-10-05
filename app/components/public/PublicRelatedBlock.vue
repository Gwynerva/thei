<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicEntityLink,
  type PublicRelatedCounts,
  type PublicRelatedPage,
} from '#layers/thei/shared/api/public';
import type { RelationEntityType } from '#layers/thei/shared/relation';
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';

/**
 * Everything related to a page's entity, at the foot of the page.
 *
 * The page carries only how many there are of each kind; the lists come one
 * kind and one page at a time, the way the home page's heatmap fetches a day
 * on demand. One tab per kind that has anything, so a project's hundreds of
 * diary entries never bury the two projects it grew out of. Each relation
 * is a card that says what it is (`PublicRelationCard`), and the directed
 * kinds come first, as the server lists them.
 */
const { counts, url } = defineProps<{
  counts: PublicRelatedCounts;
  /** The entity's own `…/related` address, without the query. */
  url: string;
}>();

const total = computed(() => publicRelatedTotal(counts));
const tabs = computed(() =>
  relationKindTabs(counts).filter((tab) => (tab.count ?? 0) > 0),
);
const kind = ref<RelationEntityType>(tabs.value[0]?.key ?? 'project');

// The first page of the chosen kind is fetched with the page, so it is in
// the served HTML; a tab switch fetches its own first page in place.
const { data: page, status } = await useFetch<PublicRelatedPage>(url, {
  key: `related:${url}`,
  query: computed(() => ({ kind: kind.value, page: 1 })),
  immediate: total.value > 0,
});
const loading = computed(() => status.value === 'pending');

/** Pages past the first, appended as they are asked for. */
const extra = ref<PublicEntityLink[]>([]);
const nextPage = ref(2);
const loadingMore = ref(false);
const moreError = ref(false);
const more = computed(() => (page.value?.pageCount ?? 0) >= nextPage.value);

/**
 * Each request for more is numbered; one answered after another took its
 * place — the reader moved to another tab — is ignored.
 */
let moreRequest = 0;

watch(kind, () => {
  moreRequest++;
  extra.value = [];
  nextPage.value = 2;
  loadingMore.value = false;
  moreError.value = false;
});

async function loadMore() {
  if (!more.value || loadingMore.value) return;
  const request = ++moreRequest;
  loadingMore.value = true;
  moreError.value = false;
  try {
    const loaded = await $fetch<PublicRelatedPage>(url, {
      query: { kind: kind.value, page: nextPage.value },
    });
    if (request !== moreRequest) return;
    extra.value = [...extra.value, ...loaded.items];
    nextPage.value += 1;
  } catch {
    if (request === moreRequest) moreError.value = true;
  } finally {
    if (request === moreRequest) loadingMore.value = false;
  }
}

const items = computed(() => [...(page.value?.items ?? []), ...extra.value]);

function itemKey(item: PublicEntityLink) {
  return isPublicSecret(item) ? item.key : `${item.entityType}:${item.href}`;
}
</script>

<script lang="ts">
/** The anchor the table of contents points at. */
export const PUBLIC_RELATED_SECTION_ID = 'related-entities';

export function publicRelatedTotal(counts: PublicRelatedCounts): number {
  return Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0);
}

/** The entry this block adds to the table of contents. */
export function publicRelatedHeading(title: string): ContentHeading {
  return {
    title,
    level: 2,
    id: PUBLIC_RELATED_SECTION_ID,
    href: `#${PUBLIC_RELATED_SECTION_ID}`,
    path: PUBLIC_RELATED_SECTION_ID,
    icon: 'arrow-cycle',
  };
}
</script>

<template>
  <section
    v-if="total"
    :id="PUBLIC_RELATED_SECTION_ID"
    aria-labelledby="related-entities-heading"
    class="flex scroll-mt-[var(--public-anchor-offset,8rem)] flex-col gap-sm"
  >
    <PublicSectionHeader
      heading-id="related-entities-heading"
      :title="phrase.related_entities"
      icon="arrow-cycle"
    />
    <UnderlineTabs
      v-model="kind"
      :tabs="tabs"
      :label="phrase.related_entities"
      controls="related-entities-panel"
    />
    <div
      id="related-entities-panel"
      role="tabpanel"
      :aria-labelledby="`related-entities-panel-${kind}-tab`"
      class="flex min-w-0 flex-col gap-sm"
    >
      <p v-if="loading" class="text-sm text-text-3">
        <Icon name="loading" class="mr-xs" />{{ phrase.life_activity_loading }}
      </p>
      <template v-else>
        <div class="grid min-w-0 gap-xs sm:grid-cols-2">
          <PublicRelationCard
            v-for="item in items"
            :key="itemKey(item)"
            :link="item"
            :kind="kind"
          />
        </div>
        <!-- A button a thumb can find: the full width on a phone. -->
        <Button
          v-if="more"
          type="button"
          variant="secondary"
          :disabled="loadingMore"
          class="flex min-h-10 w-full items-center justify-center gap-xs
            font-semibold sm:w-auto sm:self-start"
          data-relation-more
          @click="loadMore"
        >
          <Icon v-if="loadingMore" name="loading" />
          <span v-else>{{
            moreError ? phrase.profile_load_error : phrase.profile_more
          }}</span>
        </Button>
      </template>
    </div>
  </section>
</template>
