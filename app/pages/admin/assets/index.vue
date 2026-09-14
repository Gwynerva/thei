<script setup lang="ts">
import type { AssetLibraryFilesResponse } from '#layers/thei/shared/asset-library';
import { assetSourceName } from '#layers/thei/shared/asset';
import { libraryAssetDetailsModal } from '../../../modals/asset-library/details-modal';
definePageMeta({ layout: 'admin' });
await useAdminTabTitle(computed(() => phrase.value.asset_library));
const route = useRoute(),
  router = useRouter();
const search = ref(typeof route.query.q === 'string' ? route.query.q : '');
const ready = ref(false);
const focusedAssetUuid = ref<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
const query = computed(() => ({
  q: typeof route.query.q === 'string' ? route.query.q : '',
  type: typeof route.query.type === 'string' ? route.query.type : undefined,
  usage: typeof route.query.usage === 'string' ? route.query.usage : undefined,
  page: Number(route.query.page ?? 1),
  pageSize: 20,
}));
const { data, status, error, refresh } =
  await useFetch<AssetLibraryFilesResponse>('/api/admin/assets', { query });
const humanSize = useHumanSize();
function update(values: Record<string, string | undefined>) {
  void router.replace({
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
    <div class="flex flex-col gap-sm sm:flex-row">
      <input
        v-model="search"
        type="search"
        :placeholder="phrase.asset_library_search"
        :aria-label="phrase.asset_library_search"
        class="min-w-0 flex-1 rounded-normal border border-border-1 bg-bg-2 p-xs
          outline-none focus:border-accent"
      />
      <select
        :value="query.type ?? ''"
        :aria-label="phrase.format"
        class="rounded-normal border border-border-1 bg-bg-2 p-xs"
        @change="
          update({
            type: ($event.target as HTMLSelectElement).value || undefined,
          })
        "
      >
        <option value="">{{ phrase.asset_library_all }}</option>
        <option value="image">{{ phrase.image }}</option>
        <option value="video">{{ phrase.video }}</option>
        <option value="audio">{{ phrase.audio }}</option>
        <option value="other">{{ phrase.other_files }}</option>
      </select>
      <select
        :value="query.usage ?? ''"
        :aria-label="phrase.asset_library_usage"
        class="rounded-normal border border-border-1 bg-bg-2 p-xs"
        @change="
          update({
            usage: ($event.target as HTMLSelectElement).value || undefined,
          })
        "
      >
        <option value="">{{ phrase.asset_library_all }}</option>
        <option value="used">{{ phrase.asset_library_used }}</option>
        <option value="unused">{{ phrase.asset_library_unused }}</option>
      </select>
    </div>
    <div v-if="error" class="mt-md text-text-error">
      {{ phrase.failed_to_fetch_data }}
      <button class="cursor-pointer underline" @click="refresh()">
        {{ phrase.asset_library_retry }}
      </button>
    </div>
    <Box v-if="data?.items.length" class="mt-md overflow-hidden">
      <button
        v-for="item in data.items"
        :key="item.asset.assetUuid"
        :data-asset-uuid="item.asset.assetUuid"
        type="button"
        class="flex w-full cursor-pointer items-center gap-sm border-b
          border-border-1 p-sm text-left last:border-b-0 hocus:bg-bg-3"
        @focus="focusedAssetUuid = item.asset.assetUuid"
        @blur="focusedAssetUuid = undefined"
        @click="openModal(libraryAssetDetailsModal, { asset: item.asset })"
      >
        <AssetTile
          :media="item.asset.media"
          :extension="item.asset.extension || '?'"
          :engaged="focusedAssetUuid === item.asset.assetUuid"
          loop
          :overlay="{ showVideo: true }"
          class="size-14 shrink-0 sm:size-18"
        />
        <span class="min-w-0 flex-1"
          ><span class="block truncate font-semibold">{{
            assetSourceName(item.asset.meta) ?? item.asset.assetUuid
          }}</span
          ><span class="mt-1 block text-xs text-text-3"
            >{{ item.asset.extension.toUpperCase() }} ·
            {{ humanSize(item.asset.size) }}</span
          ></span
        >
        <AssetUsageBadges
          :counts="item.counts"
          class="max-w-28 shrink-0 sm:max-w-56"
        />
        <Icon
          name="chevron-right"
          class="hidden shrink-0 text-text-3 sm:block"
        />
      </button>
    </Box>
    <p
      v-else-if="status !== 'pending' && !error"
      class="p-lg text-center text-text-3"
    >
      {{ phrase.asset_library_empty }}
    </p>
    <div v-if="status === 'pending'" role="status" class="p-md text-center">
      <Icon name="loading" />
    </div>
    <AdminPagination
      v-if="data"
      :page="data.page"
      :page-count="data.pageCount"
      @page="
        router.push({
          query: { ...route.query, page: $event === 1 ? undefined : $event },
        })
      "
    />
  </div>
</template>
