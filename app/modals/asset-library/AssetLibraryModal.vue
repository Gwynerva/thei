<script setup lang="ts">
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import {
  assetSourceKey,
  type AssetLibrarySection,
  type AssetLibraryResponse,
  type AssetLibraryFilesResponse,
  type AssetLibraryAvailability,
  type AssetLibraryItem,
  type AssetSelectionConstraints,
} from '#layers/thei/shared/asset-library';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import { editFileModal } from '../upload-settings/modal';
import {
  assetDeletionLabel,
  assetFileLabel,
  assetRoleLabel,
  assetSourceIcon,
} from '../../composables/asset-library-labels';

const props = defineProps<{
  modalData: AssetSelectionConstraints & {
    multiple?: boolean;
    uploadProfile?: AssetUploadProfile;
    usageDelta?: Record<string, number>;
  };
}>();
const emit = defineEmits<{
  modalResult: [result: { type: 'assets-ready'; assets: AssetVariantInfo[] }];
}>();
const search = ref('');
const query = ref('');
const type = ref('');
const sections = ref<AssetLibrarySection[]>([]);
const focusedAssetUuid = ref<string>();
const files = reactive<Record<string, AssetLibraryFilesResponse>>({});
const expanded = ref(new Set<string>());
const loadingFiles = ref(new Set<string>());
const fileErrors = reactive<Record<string, boolean>>({});
const selected = ref<AssetVariantInfo[]>([]);
const page = ref(1);
const pageCount = ref(1);
const loading = ref(false);
const error = ref(false);
const selecting = ref(false);
const selectionMessage = ref('');
const searchInput = shallowRef<HTMLInputElement>();
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | undefined;
let generation = 0;
const selectionQuery = () => ({
  acceptedExtensions:
    props.modalData.acceptedExtensions === '*'
      ? '*'
      : props.modalData.acceptedExtensions
        ? JSON.stringify(props.modalData.acceptedExtensions)
        : undefined,
  maxSize: props.modalData.maxSize,
  sizeLimitPolicy: props.modalData.sizeLimitPolicy,
  imageOnly: props.modalData.imageOnly || undefined,
});
const requestQuery = () => ({
  ...selectionQuery(),
  q: query.value,
  type: type.value || undefined,
});
const { data: availability } = useFetch<AssetLibraryAvailability>(
  '/api/admin/assets/availability',
  { query: computed(selectionQuery) },
);
const filters = computed<Record<string, string>>(() => {
  const result: Record<string, string> = {
    '': phrase.value.asset_library_all,
  };
  const available = availability.value?.types;
  if (available?.[AssetType.Image])
    result[AssetType.Image] = phrase.value.image;
  if (available?.[AssetType.Video])
    result[AssetType.Video] = phrase.value.video;
  if (available?.[AssetType.Audio])
    result[AssetType.Audio] = phrase.value.audio;
  if (available?.[AssetType.Other])
    result[AssetType.Other] = phrase.value.other_files;
  return result;
});
function selectionErrorLabel(error: AssetLibraryItem['selectionError']) {
  if (error === 'size') return phrase.value.asset_selection_size;
  if (error === 'type') return phrase.value.asset_selection_type;
}
function tileTitle(item: AssetLibraryItem) {
  return [
    item.roles.map((role) => assetRoleLabel(role)).join(' · '),
    selectionErrorLabel(item.selectionError),
    item.deleteAfter ? assetDeletionLabel(item.deleteAfter) : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}
function title(section: AssetLibrarySection) {
  return section.type === 'unused'
    ? phrase.value.asset_library_unused
    : section.title;
}
async function load(reset = false) {
  if (reset) {
    controller?.abort();
    controller = new AbortController();
    generation++;
    page.value = 1;
    sections.value = [];
    expanded.value = new Set();
    loadingFiles.value = new Set();
    for (const key of Object.keys(files)) delete files[key];
    for (const key of Object.keys(fileErrors)) delete fileErrors[key];
  }
  const current = generation;
  const requestedPage = reset ? 1 : page.value + 1;
  loading.value = true;
  error.value = false;
  try {
    const result = await $fetch<AssetLibraryResponse>(
      '/api/admin/assets/library',
      {
        query: { ...requestQuery(), page: requestedPage },
        signal: controller?.signal,
      },
    );
    if (current !== generation) return;
    page.value = result.page;
    sections.value = reset
      ? result.items
      : [
          ...sections.value,
          ...result.items.filter(
            (s) =>
              !sections.value.some(
                (existing) => assetSourceKey(existing) === assetSourceKey(s),
              ),
          ),
        ];
    pageCount.value = result.pageCount;
    const firstUsed = result.items.find((section) => section.type !== 'unused');
    if (reset && firstUsed) await openSection(firstUsed);
  } catch (e) {
    if (current === generation && !controller?.signal.aborted)
      error.value = true;
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function loadFiles(section: AssetLibrarySection, next = false) {
  const key = assetSourceKey(section),
    current = generation;
  if (loadingFiles.value.has(key)) return;
  loadingFiles.value.add(key);
  fileErrors[key] = false;
  try {
    const result = await $fetch<AssetLibraryFilesResponse>(
      `/api/admin/assets/library/${section.type}/${encodeURIComponent(section.id)}`,
      {
        query: {
          ...requestQuery(),
          page: next ? (files[key]?.page ?? 0) + 1 : 1,
        },
        signal: controller?.signal,
      },
    );
    if (current !== generation) return;
    files[key] = {
      ...result,
      items: next
        ? [...(files[key]?.items ?? []), ...result.items]
        : result.items,
    };
  } catch {
    if (current === generation && !controller?.signal.aborted)
      fileErrors[key] = true;
  } finally {
    if (current === generation) loadingFiles.value.delete(key);
  }
}
async function openSection(section: AssetLibrarySection) {
  const key = assetSourceKey(section);
  expanded.value.add(key);
  if (!files[key]) await loadFiles(section);
}
function toggleSection(section: AssetLibrarySection) {
  const key = assetSourceKey(section);
  if (expanded.value.has(key)) expanded.value.delete(key);
  else void openSection(section);
}
async function choose(asset: AssetVariantInfo) {
  if (selecting.value) return;
  selecting.value = true;
  selectionMessage.value = '';
  try {
    const result = await openModal(editFileModal, {
      ...props.modalData,
      source: { kind: 'asset', asset },
      librarySelection: true,
    });
    if (result.type === 'asset-missing') {
      selectionMessage.value = phrase.value.asset_library_missing;
      for (const key of Object.keys(files)) {
        files[key]!.items = files[key]!.items.filter(
          (item) => item.asset.assetUuid !== asset.assetUuid,
        );
      }
      selected.value = selected.value.filter(
        (item) => item.assetUuid !== asset.assetUuid,
      );
      return;
    }
    if (result.type !== 'asset-ready') return;
    if (!props.modalData.multiple) {
      emit('modalResult', { type: 'assets-ready', assets: [result.asset] });
      return;
    }
    if (!selected.value.some((a) => a.assetUuid === result.asset.assetUuid))
      selected.value.push(result.asset);
  } finally {
    selecting.value = false;
  }
}
async function insertSelected() {
  if (selecting.value || !selected.value.length) return;
  selecting.value = true;
  selectionMessage.value = '';
  try {
    // Recheck the whole set after the user has finished configuring variants.
    await Promise.all(
      selected.value.map((asset) =>
        $fetch(`/api/admin/assets/${asset.assetUuid}/touches`, {
          method: 'POST',
          body: {
            acceptedExtensions: props.modalData.acceptedExtensions,
            maxSize: props.modalData.maxSize,
            sizeLimitPolicy: props.modalData.sizeLimitPolicy,
          },
        }),
      ),
    );
    emit('modalResult', { type: 'assets-ready', assets: [...selected.value] });
  } catch {
    selectionMessage.value = phrase.value.asset_library_selection_failed;
  } finally {
    selecting.value = false;
  }
}
watch(search, (value) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    query.value = value.trim();
    void load(true);
  }, 250);
});
watch(type, () => {
  void load(true);
});
watch(filters, (options) => {
  if (type.value && !Object.hasOwn(options, type.value)) type.value = '';
});
onMounted(() => {
  searchInput.value?.focus();
  void load(true);
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  controller?.abort();
});
</script>

<template>
  <section
    class="absolute flex h-dvh w-dvw flex-col bg-bg-1"
    :aria-label="phrase.asset_library"
  >
    <header class="shrink-0 border-b border-border-1 bg-bg-2 p-sm sm:p-md">
      <div class="mx-auto flex w-full max-w-280 flex-col gap-sm">
        <div class="flex items-center justify-between gap-sm">
          <h2 class="flex items-center gap-xs text-xl font-bold">
            <Icon name="gallery" />{{ phrase.asset_library }}
          </h2>
          <button
            type="button"
            :aria-label="phrase.close_modal"
            class="cursor-pointer rounded-normal p-xs hocus:bg-bg-3"
            @click="closeModal"
          >
            <Icon name="close" />
          </button>
        </div>
        <div class="flex h-10 items-stretch gap-xs">
          <FieldInput
            v-model="search"
            type="search"
            :placeholder="phrase.asset_library_search"
            :aria-label="phrase.asset_library_search"
            wrapper-class="min-w-0 flex-1"
            class="h-full min-w-0!"
            @element="searchInput = $event"
          />
          <FieldSelect
            v-model="type"
            :options="filters"
            :aria-label="phrase.format"
            wrapper-class="h-full shrink-0"
            class="min-w-32"
          />
        </div>
      </div>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto p-sm sm:p-md">
      <div class="mx-auto w-full max-w-280 space-y-sm">
        <p
          v-if="selectionMessage"
          role="alert"
          class="rounded-normal bg-bg-2 p-sm text-text-error"
        >
          {{ selectionMessage }}
        </p>
        <details
          v-for="section in sections"
          :key="assetSourceKey(section)"
          :open="expanded.has(assetSourceKey(section))"
          class="group/section overflow-hidden rounded-normal border
            border-border-1 bg-bg-2"
        >
          <summary
            data-asset-library-section
            class="flex w-full cursor-pointer list-none items-center gap-xs p-sm
              text-left transition-colors duration-250
              motion-reduce:transition-none hocus:bg-bg-3"
            @click.prevent="toggleSection(section)"
          >
            <Icon
              :name="assetSourceIcon[section.type]"
              class="shrink-0 text-text-3"
            /><span
              class="min-w-0 truncate font-semibold"
              :class="{ italic: section.type === 'unused' }"
              >{{ title(section) }}</span
            ><span
              class="rounded-normal bg-bg-3 px-xs py-1 text-xs text-text-2
                tabular-nums"
              >{{ section.count }}</span
            ><span class="min-w-0 flex-1"></span
            ><Icon
              name="chevron-right"
              class="shrink-0 rotate-90 transition-transform duration-250
                group-open/section:-rotate-90 motion-reduce:transition-none"
            />
          </summary>
          <div class="min-h-0 overflow-hidden">
            <div class="border-t border-border-1 p-sm">
              <p
                v-if="section.type === 'unused'"
                class="mb-sm text-sm text-text-3"
              >
                {{ phrase.asset_library_unused_hint }}
              </p>
              <div
                class="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))]
                  gap-sm"
              >
                <button
                  v-for="item in files[assetSourceKey(section)]?.items ?? []"
                  :key="item.asset.assetUuid"
                  :data-asset-uuid="item.asset.assetUuid"
                  type="button"
                  :disabled="selecting"
                  :aria-label="assetFileLabel(item.asset)"
                  :data-title-popup="tileTitle(item)"
                  class="w-full cursor-pointer rounded-normal transition-opacity
                    duration-250 motion-reduce:transition-none"
                  :class="{ 'opacity-60': item.selectionError }"
                  @focus="focusedAssetUuid = item.asset.assetUuid"
                  @blur="focusedAssetUuid = undefined"
                  @click="choose(item.asset)"
                >
                  <AssetTile
                    :media="item.asset.media"
                    :extension="item.asset.extension || '?'"
                    :engaged="focusedAssetUuid === item.asset.assetUuid"
                    :tone="item.deleteAfter ? 'danger' : 'default'"
                    loop
                    :selected="
                      selected.some((a) => a.assetUuid === item.asset.assetUuid)
                    "
                    :overlay="{
                      showVideo: true,
                      showExtension: true,
                      showSize: true,
                      size: item.asset.size,
                      pendingDeletion: Boolean(item.deleteAfter),
                      warning: selectionErrorLabel(item.selectionError),
                    }"
                    class="aspect-square w-full"
                  />
                </button>
              </div>
              <div
                v-if="loadingFiles.has(assetSourceKey(section))"
                role="status"
                class="p-sm text-center"
              >
                <Icon name="loading" />
              </div>
              <button
                v-else-if="fileErrors[assetSourceKey(section)]"
                type="button"
                class="mt-sm cursor-pointer text-text-error"
                @click="loadFiles(section)"
              >
                {{ phrase.asset_library_retry }}
              </button>
              <button
                v-else-if="
                  files[assetSourceKey(section)] &&
                  files[assetSourceKey(section)]!.page <
                    files[assetSourceKey(section)]!.pageCount
                "
                type="button"
                class="mt-sm cursor-pointer text-sm text-accent"
                @click="loadFiles(section, true)"
              >
                {{ phrase.asset_library_more }}
              </button>
            </div>
          </div>
        </details>
        <p
          v-if="!loading && !error && !sections.length"
          class="p-lg text-center text-text-3"
        >
          {{ phrase.asset_library_empty }}
        </p>
        <div v-if="loading" role="status" class="p-md text-center">
          <Icon name="loading" />
        </div>
        <button
          v-else-if="error"
          type="button"
          class="w-full cursor-pointer p-sm text-text-error"
          @click="load(sections.length === 0)"
        >
          {{ phrase.failed_to_fetch_data }} · {{ phrase.asset_library_retry }}
        </button>
        <button
          v-else-if="page < pageCount"
          type="button"
          class="w-full cursor-pointer rounded-normal bg-bg-2 p-sm text-accent"
          @click="load()"
        >
          {{ phrase.asset_library_more }}
        </button>
      </div>
    </div>
    <footer
      v-if="modalData.multiple"
      class="shrink-0 border-t border-border-1 bg-bg-2 p-sm"
    >
      <div
        class="mx-auto flex max-w-280 flex-col gap-sm sm:flex-row
          sm:items-center"
      >
        <div
          class="flex max-h-24 min-w-0 flex-1 flex-wrap gap-xs overflow-y-auto"
        >
          <button
            v-for="asset in selected"
            :key="asset.assetUuid"
            type="button"
            :disabled="selecting"
            :aria-label="assetFileLabel(asset)"
            class="size-12 shrink-0 cursor-pointer"
            @click="
              selected = selected.filter((a) => a.assetUuid !== asset.assetUuid)
            "
          >
            <AssetTile
              :media="asset.media"
              :extension="asset.extension || '?'"
              class="size-full"
            >
              <template #overlay>
                <span
                  class="absolute inset-0 z-40 flex items-center justify-center
                    bg-bg-1/60 opacity-0 transition hocus:opacity-100"
                >
                  <Icon name="close" />
                </span>
              </template>
            </AssetTile>
          </button>
        </div>
        <Button
          variant="primary"
          :disabled="!selected.length || selecting"
          @click="insertSelected"
          >{{ phrase.asset_library_insert }} · {{ selected.length }}</Button
        >
      </div>
    </footer>
  </section>
</template>

<style scoped>
summary::-webkit-details-marker {
  display: none;
}

details::details-content {
  display: grid;
  grid-template-rows: 0fr;
  overflow: clip;
  transition:
    grid-template-rows 0.25s ease-out,
    content-visibility 0.25s allow-discrete;
}
details[open]::details-content {
  grid-template-rows: 1fr;
}
@supports (interpolate-size: allow-keywords) {
  details::details-content {
    interpolate-size: allow-keywords;
    grid-template-rows: 1fr;
    height: 0;
    transition:
      height 0.25s ease-out,
      content-visibility 0.25s allow-discrete;
  }
  details[open]::details-content {
    height: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  details::details-content {
    transition: none;
  }
}
</style>
