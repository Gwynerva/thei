<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicEntityLink,
  type PublicReferenceLink,
  type PublicRelatedCounts,
  type PublicRelatedPage,
  type PublicSecretReference,
} from '#layers/thei/shared/api/public';
import {
  RELATION_ENTITY_TYPES,
  type RelationEntityType,
} from '#layers/thei/shared/relation';
import {
  RELATION_GROUP_ORDER,
  relationEntityIcon,
  relationGroupPhraseKey,
  relationTypeIcon,
} from '#layers/thei/shared/relation-display';
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';
import type { TabStripItem } from '../TabStrip.vue';

/**
 * Everything related to a page's entity, at the foot of the page.
 *
 * The page carries only how many there are of each kind; the lists come one
 * kind and one page at a time, the way the home page's heatmap fetches a day
 * on demand. One tab per kind that has anything, so a project's hundreds of
 * diary entries never bury the two projects it grew out of. Inside a tab the
 * relations are grouped by what they say, the directed kinds first.
 */
const { counts, url } = defineProps<{
  counts: PublicRelatedCounts;
  /** The entity's own `…/related` address, without the query. */
  url: string;
}>();

const total = computed(() => publicRelatedTotal(counts));
const kindLabels = computed<Record<RelationEntityType, string>>(() => ({
  project: phrase.value.projects,
  event: phrase.value.events,
  'diary-entry': phrase.value.diary,
}));
const tabs = computed<TabStripItem<RelationEntityType>[]>(() =>
  RELATION_ENTITY_TYPES.filter((type) => (counts[type] ?? 0) > 0).map(
    (type) => ({
      key: type,
      label: kindLabels.value[type],
      icon: relationEntityIcon(type),
      count: counts[type],
    }),
  ),
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

watch(kind, () => {
  extra.value = [];
  nextPage.value = 2;
  moreError.value = false;
});

async function loadMore() {
  if (!more.value || loadingMore.value) return;
  loadingMore.value = true;
  moreError.value = false;
  const current = kind.value;
  try {
    const loaded = await $fetch<PublicRelatedPage>(url, {
      query: { kind: current, page: nextPage.value },
    });
    if (kind.value !== current) return;
    extra.value = [...extra.value, ...loaded.items];
    nextPage.value += 1;
  } catch {
    if (kind.value === current) moreError.value = true;
  } finally {
    if (kind.value === current) loadingMore.value = false;
  }
}

function asReferenceLink(
  entity: PublicEntityLink,
): PublicReferenceLink | PublicSecretReference {
  return isPublicSecret(entity)
    ? entity
    : {
        kind: entity.entityType,
        title: entity.title,
        href: entity.href,
        description: entity.note || entity.summary,
        iconMedia: entity.iconMedia,
        ...(entity.date ? { date: entity.date } : {}),
      };
}

const items = computed(() => [...(page.value?.items ?? []), ...extra.value]);

/**
 * The list split by what the relation says, named from this entity's side.
 * A lone plain group needs no name; a directed one is named even alone,
 * since the name is the whole point of it.
 */
const groups = computed(() =>
  RELATION_GROUP_ORDER.map((type) => ({
    key: type,
    icon: relationTypeIcon(type),
    title: phrase.value[relationGroupPhraseKey(type)],
    items: items.value
      .filter((item) => (item.relationType ?? 'related') === type)
      .map(asReferenceLink),
  })).filter((group) => group.items.length > 0),
);
const titled = computed(
  () => groups.value.length > 1 || groups.value[0]?.key !== 'related',
);
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
    <TabStrip
      v-if="tabs.length > 1"
      v-model="kind"
      :tabs="tabs"
      :label="phrase.related_entities"
      controls="related-entities-panel"
    />
    <div
      id="related-entities-panel"
      role="tabpanel"
      class="flex min-w-0 flex-col gap-sm"
    >
      <p v-if="loading" class="text-sm text-text-3">
        <Icon name="loading" class="mr-xs" />{{ phrase.life_activity_loading }}
      </p>
      <template v-else>
        <div
          v-for="group in groups"
          :key="group.key"
          class="flex min-w-0 flex-col gap-xs"
        >
          <!-- The mark is drawn larger than the label: it is the one thing
               that says which way the relation runs. -->
          <div
            v-if="titled"
            class="flex items-center gap-xs px-1 text-xs font-semibold
              text-text-3"
          >
            <Icon
              :name="group.icon"
              class="shrink-0 text-xl"
              aria-hidden="true"
            />
            <span>{{ group.title }}</span>
            <span class="h-px min-w-0 flex-1 bg-border-1" aria-hidden="true" />
          </div>
          <!-- The tab already says what kind of thing these are, so the
               tiles carry no kind badge of their own. -->
          <PublicReferenceLinks
            :links="group.items"
            hide-kind
            class="sm:grid sm:grid-cols-2"
          />
        </div>
        <button
          v-if="more"
          type="button"
          :disabled="loadingMore"
          class="cursor-pointer self-start px-1 text-xs font-semibold
            text-accent transition hocus:underline"
          @click="loadMore"
        >
          <Icon v-if="loadingMore" name="loading" />
          <span v-else>{{
            moreError ? phrase.profile_load_error : phrase.profile_more
          }}</span>
        </button>
      </template>
    </div>
  </section>
</template>
