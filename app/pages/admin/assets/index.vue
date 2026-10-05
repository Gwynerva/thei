<script setup lang="ts">
import { AssetType } from '#layers/thei/shared/asset';
import {
  assetLibraryWhereFromQuery,
  assetLibraryWhereQuery,
  type AssetLibraryAssetsResponse,
  type AssetLibraryWhere,
} from '#layers/thei/shared/asset-library';
import { libraryAssetDetailsModal } from '../../../modals/asset-library/details-modal';
import {
  assetDeletionLabel,
  assetFileLabel,
} from '../../../composables/asset-library-labels';
definePageMeta({ layout: 'admin' });
await useAdminTabTitle(computed(() => phrase.value.asset_library));
const route = useRoute(),
  router = useRouter();
const search = ref(typeof route.query.q === 'string' ? route.query.q : '');
const ready = ref(false);
const focusedAssetUuid = ref<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
/** The address holds the search, so a filtered list can be shared and reloaded. */
const query = computed(() => {
  const value = route.query;
  return {
    q: typeof value.q === 'string' ? value.q : '',
    type: Object.values(AssetType).includes(value.type as AssetType)
      ? (value.type as AssetType)
      : undefined,
    ...assetLibraryWhereQuery(assetLibraryWhereFromQuery(value)),
    page: Number(value.page ?? 1),
  };
});
const { data, status, error, refresh } =
  await useFetch<AssetLibraryAssetsResponse>('/api/admin/assets', { query });
const type = computed({
  get: () => query.value.type ?? '',
  set: (value: AssetType | '') => update({ type: value || undefined }),
});
const where = computed({
  get: () => assetLibraryWhereFromQuery(query.value),
  set: (value: AssetLibraryWhere) =>
    update({
      source: undefined,
      usage: undefined,
      ...assetLibraryWhereQuery(value),
    }),
});
function resetFilters() {
  clearTimeout(timer);
  search.value = '';
  update({
    q: undefined,
    type: undefined,
    source: undefined,
    usage: undefined,
  });
}
function update(values: Record<string, string | undefined>) {
  void router.replace({
    path: route.path,
    query: { ...route.query, page: undefined, ...values },
  });
}
watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => update({ q: value.trim() || undefined }), 250);
});
watch(
  () => route.query.q,
  (value) => {
    search.value = typeof value === 'string' ? value : '';
  },
);
onBeforeUnmount(() => clearTimeout(timer));
onMounted(() => {
  ready.value = true;
});
</script>
<template>
  <StickyGlassHeader width="var(--width-wide)"
    ><h1 class="flex items-center gap-xs py-sm text-xl font-bold">
      <Icon name="gallery" />{{ phrase.asset_library }}
    </h1></StickyGlassHeader
  >
  <div
    class="m-auto w-(--width-wide) max-w-full px-window py-lg"
    :data-admin-assets-ready="ready ? 'true' : undefined"
  >
    <AssetLibrarySearch
      v-model:search="search"
      v-model:type="type"
      v-model:where="where"
      :facets="data?.facets"
    />
    <div v-if="error" class="mt-md text-text-error">
      {{ phrase.failed_to_fetch_data }}
      <button class="cursor-pointer underline" @click="refresh()">
        {{ phrase.asset_library_retry }}
      </button>
    </div>
    <div
      v-if="data?.items.length"
      class="mt-md grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-sm"
    >
      <AssetTile
        v-for="item in data.items"
        :key="item.asset.assetUuid"
        :data-asset-uuid="item.asset.assetUuid"
        :media="item.asset.media"
        :extension="item.asset.extension || '?'"
        :engaged="focusedAssetUuid === item.asset.assetUuid"
        :tone="item.deleteAfter ? 'danger' : 'default'"
        loop
        :overlay="{
          showVideo: true,
          showExtension: true,
          showSize: true,
          size: item.asset.size,
          pendingDeletion: Boolean(item.deleteAfter),
          inHistory: item.inHistory,
        }"
        :aria-label="assetFileLabel(item.asset)"
        :data-title-popup="
          item.deleteAfter
            ? assetDeletionLabel(item.deleteAfter)
            : item.inHistory
              ? phrase.asset_library_in_history
              : assetFileLabel(item.asset)
        "
        class="aspect-square w-full cursor-pointer"
        @focus="focusedAssetUuid = item.asset.assetUuid"
        @blur="focusedAssetUuid = undefined"
        @click="
          openModal(libraryAssetDetailsModal, {
            asset: item.asset,
            // A preview made again shows in the tile only once the list is
            // read again.
            onRefreshed: () => refresh(),
          })
        "
      />
    </div>
    <template v-else-if="status !== 'pending' && !error">
      <EmptyState
        v-if="query.q || query.type || where !== 'all'"
        icon="face-dead"
        :title="phrase.asset_library_empty"
        :description="phrase.admin_search_no_results_description"
        class="mt-md"
      >
        <button
          type="button"
          class="flex cursor-pointer items-center gap-xs rounded-normal border
            border-border-1 bg-bg-1 px-sm py-xs text-sm font-semibold
            text-text-2 transition hocus:border-border-3 hocus:text-text-1"
          @click="resetFilters"
        >
          <Icon name="close" />
          <span>{{ phrase.reset_search }}</span>
        </button>
      </EmptyState>
      <EmptyState
        v-else
        icon="gallery"
        :title="phrase.admin_assets_empty"
        :description="phrase.admin_assets_empty_description"
        class="mt-md"
      />
    </template>
    <div
      v-if="status === 'pending' && !data?.items.length"
      role="status"
      class="p-md text-center"
    >
      <Icon name="loading" />
    </div>
    <Pagination
      v-if="data"
      :page="data.page"
      :page-count="data.pageCount"
      :pending="status === 'pending'"
      class="pt-md"
    />
  </div>
</template>
