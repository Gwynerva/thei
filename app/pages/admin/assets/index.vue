<script setup lang="ts">
import { AssetType } from '#layers/thei/shared/asset';
import {
  assetLibraryWhereFromQuery,
  assetLibraryWhereQuery,
  isAssetLibraryOrder,
  type AssetLibraryItem,
  type AssetLibraryOrder,
  type AssetLibraryWhere,
} from '#layers/thei/shared/asset-library';
import { libraryAssetDetailsModal } from '../../../modals/asset-library/details-modal';

/**
 * Every stored file, as the picker shows them (`AssetLibraryFeed`): one run
 * through time, a click opening a file's window. The address keeps the
 * search, so a narrowed library can be shared and reloaded.
 */
definePageMeta({ layout: 'admin' });
await useAdminTabTitle(computed(() => phrase.value.asset_library));
const route = useRoute(),
  router = useRouter();
const value = route.query;
const search = ref(typeof value.q === 'string' ? value.q : '');
const type = ref<AssetType | ''>(
  Object.values(AssetType).includes(value.type as AssetType)
    ? (value.type as AssetType)
    : '',
);
const where = ref<AssetLibraryWhere>(assetLibraryWhereFromQuery(value));
const order = ref<AssetLibraryOrder>(
  isAssetLibraryOrder(value.order) ? value.order : 'new',
);
const ready = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
function remember() {
  void router.replace({
    path: route.path,
    query: {
      q: search.value.trim() || undefined,
      type: type.value || undefined,
      ...assetLibraryWhereQuery(where.value),
      order: order.value === 'new' ? undefined : order.value,
    },
  });
}
watch(search, () => {
  clearTimeout(timer);
  timer = setTimeout(remember, 250);
});
watch([type, where, order], remember);
onBeforeUnmount(() => clearTimeout(timer));
onMounted(() => {
  ready.value = true;
});

const stickyHeader = useStickyHeaderContext();
const stickyTop = computed(
  () => `calc(var(--height-admin-bar) + ${stickyHeader?.height.value ?? 0}px)`,
);
function open(item: AssetLibraryItem) {
  void openModal(libraryAssetDetailsModal, { asset: item.asset });
}
</script>
<template>
  <StickyGlassHeader width="var(--width-wide)"
    ><h1 class="flex items-center gap-xs py-sm text-lg font-bold sm:text-xl">
      <Icon name="gallery" />{{ phrase.asset_library }}
    </h1></StickyGlassHeader
  >
  <div
    class="m-auto w-(--width-wide) max-w-full px-window py-lg"
    :data-admin-assets-ready="ready ? 'true' : undefined"
  >
    <!-- An opaque box: the admin's grid never shows through the files. -->
    <Box class="p-sm sm:p-md">
      <ClientOnly>
        <AssetLibraryFeed
          v-model:search="search"
          v-model:type="type"
          v-model:where="where"
          v-model:order="order"
          :sticky-top="stickyTop"
          ground="box"
          bleed="-mx-sm px-sm sm:-mx-md sm:px-md"
          @choose="open"
          @preview="open"
        />
      </ClientOnly>
    </Box>
  </div>
</template>
