<script setup lang="ts">
import type { AssetLibraryFilesResponse } from '#layers/thei/shared/asset-library';
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
const query = computed(() => ({
  q: typeof route.query.q === 'string' ? route.query.q : '',
  type: typeof route.query.type === 'string' ? route.query.type : undefined,
  usage: typeof route.query.usage === 'string' ? route.query.usage : undefined,
  page: Number(route.query.page ?? 1),
  pageSize: 20,
}));
const { data, status, error, refresh } =
  await useFetch<AssetLibraryFilesResponse>('/api/admin/assets', { query });
const typeOptions = computed(() => ({
  '': phrase.value.asset_library_all,
  image: phrase.value.image,
  video: phrase.value.video,
  audio: phrase.value.audio,
  other: phrase.value.other_files,
}));
const usageOptions = computed(() => ({
  '': phrase.value.asset_library_all,
  used: phrase.value.asset_library_used,
  unused: phrase.value.asset_library_unused,
}));
const type = computed({
  get: () => query.value.type ?? '',
  set: (value: string) => update({ type: value || undefined }),
});
const usage = computed({
  get: () => query.value.usage ?? '',
  set: (value: string) => update({ usage: value || undefined }),
});
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
    <div class="flex flex-wrap items-stretch gap-xs">
      <FieldInput
        v-model="search"
        type="search"
        :placeholder="phrase.asset_library_search"
        :aria-label="phrase.asset_library_search"
        class="h-10 text-sm"
        wrapper-class="min-w-52 flex-1 basis-72"
      />
      <FieldSelect
        v-model="type"
        :options="typeOptions"
        :aria-label="phrase.format"
        wrapper-class="h-10"
      />
      <FieldSelect
        v-model="usage"
        :options="usageOptions"
        :aria-label="phrase.asset_library_usage"
        wrapper-class="h-10"
      />
    </div>
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
        }"
        :aria-label="assetFileLabel(item.asset)"
        :data-title-popup="
          item.deleteAfter
            ? assetDeletionLabel(item.deleteAfter)
            : assetFileLabel(item.asset)
        "
        class="aspect-square w-full cursor-pointer"
        @focus="focusedAssetUuid = item.asset.assetUuid"
        @blur="focusedAssetUuid = undefined"
        @click="openModal(libraryAssetDetailsModal, { asset: item.asset })"
      />
    </div>
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
