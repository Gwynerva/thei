<script setup lang="ts">
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import type { AssetType } from '#layers/thei/shared/asset';
import {
  assetSelectionKinds,
  type AssetLibraryItem,
  type AssetLibraryOrder,
  type AssetLibraryWhere,
  type AssetSelectionConstraints,
} from '#layers/thei/shared/asset-library';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import ModalScreenBar from '../ModalScreenBar.vue';
import { editFileModal } from '../upload-settings/modal';
import { libraryAssetDetailsModal } from './details-modal';
import { assetFileLabel } from '../../composables/asset-library-labels';
import { libraryHereOf } from '../../composables/asset-library-here';

/**
 * Picks stored files again: the library as one run through time
 * (`AssetLibraryFeed`), what is being edited first. A click takes a file as
 * it is — what reusing one nearly always means; the button on its tile opens
 * the editor for any other way. One file is taken at once; several are
 * gathered in the footer, each removable, and inserted together.
 */
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
const route = useRoute();
const search = ref('');
const type = ref<AssetType | ''>('');
const where = ref<AssetLibraryWhere>('all');
const order = ref<AssetLibraryOrder>('new');
const selected = ref<AssetVariantInfo[]>([]);
const selecting = ref(false);
const selectionMessage = ref('');
const feed = shallowRef<{ reset: () => Promise<void> }>();
const here = libraryHereOf(route.path);
const constraints = computed<AssetSelectionConstraints>(() => ({
  acceptedExtensions: props.modalData.acceptedExtensions,
  maxSize: props.modalData.maxSize,
  sizeLimitPolicy: props.modalData.sizeLimitPolicy,
  imageOnly: props.modalData.imageOnly,
}));
const kinds = computed(() => assetSelectionKinds(constraints.value));
const selectedIds = computed(() =>
  props.modalData.multiple
    ? selected.value.map((asset) => asset.assetUuid)
    : undefined,
);

/**
 * Confirms files are still there and still fit, as the editor does when it
 * hands one over, then hands them all over.
 */
async function deliver(assets: AssetVariantInfo[]) {
  selecting.value = true;
  selectionMessage.value = '';
  try {
    await Promise.all(
      assets.map((asset) =>
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
    emit('modalResult', { type: 'assets-ready', assets });
  } catch {
    selectionMessage.value = phrase.value.asset_library_selection_failed;
    void feed.value?.reset();
  } finally {
    selecting.value = false;
  }
}

/**
 * A click takes a file as it is: at once when one is picked, into the footer
 * when several are, and a second click lets it go. A file too large to take
 * as it is goes through the editor, where a smaller variant is made.
 */
async function choose(item: AssetLibraryItem) {
  if (selecting.value) return;
  if (item.selectionError) return edit(item);
  if (!props.modalData.multiple) return deliver([item.asset]);
  if (selected.value.some((a) => a.assetUuid === item.asset.assetUuid))
    selected.value = selected.value.filter(
      (a) => a.assetUuid !== item.asset.assetUuid,
    );
  else selected.value.push(item.asset);
}

/** The editor, for taking a file otherwise: a new variant, a crop. */
async function edit(item: AssetLibraryItem) {
  if (selecting.value) return;
  selecting.value = true;
  selectionMessage.value = '';
  try {
    const result = await openModal(editFileModal, {
      ...props.modalData,
      source: { kind: 'asset', assetUuid: item.asset.assetUuid },
      librarySelection: true,
    });
    if (result.type === 'asset-missing') {
      selectionMessage.value = phrase.value.asset_library_missing;
      void feed.value?.reset();
      return;
    }
    if (result.type !== 'asset-ready') return;
    if (!props.modalData.multiple) {
      emit('modalResult', { type: 'assets-ready', assets: [result.asset] });
      return;
    }
    // The variant made stands for the file it was made from.
    selected.value = [
      ...selected.value.filter((a) => a.assetUuid !== item.asset.assetUuid),
      ...(selected.value.some((a) => a.assetUuid === result.asset.assetUuid)
        ? []
        : [result.asset]),
    ];
  } finally {
    selecting.value = false;
  }
}
function preview(item: AssetLibraryItem) {
  void openModal(libraryAssetDetailsModal, { asset: item.asset });
}
function insertSelected() {
  if (selecting.value || !selected.value.length) return;
  return deliver([...selected.value]);
}
</script>

<template>
  <section
    class="absolute flex h-dvh w-dvw flex-col bg-bg-1"
    :aria-label="phrase.asset_library"
  >
    <header class="shrink-0 border-b border-border-1 bg-bg-2 py-xs">
      <!-- The same column as the run's, so their edges line up. -->
      <div class="mx-auto w-full max-w-280 px-sm sm:px-md">
        <ModalScreenBar icon="gallery" :title="phrase.asset_library">
          <AssetAspectHint :profile="modalData.uploadProfile" />
        </ModalScreenBar>
      </div>
    </header>
    <!-- No padding on the scroller itself: the bar of the month sticks to
         its very top, right under the header, and spans it edge to edge. -->
    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- The bar's width is read from here, inside the scrollbar. -->
      <div class="@container">
        <div class="mx-auto w-full max-w-280 px-sm py-sm sm:px-md sm:py-md">
          <AssetLibraryFeed
            ref="feed"
            v-model:search="search"
            v-model:type="type"
            v-model:where="where"
            v-model:order="order"
            :constraints
            :kinds
            :here
            :selected="selectedIds"
            :busy="selecting"
            editable
            autofocus
            bleed="mx-[calc(50%-50cqw)] px-[calc(50cqw-50%)]"
            @choose="choose"
            @edit="edit"
            @preview="preview"
          >
            <template #notice>
              <p
                v-if="selectionMessage"
                role="alert"
                class="rounded-normal bg-bg-2 p-sm text-text-error"
              >
                {{ selectionMessage }}
              </p>
            </template>
          </AssetLibraryFeed>
        </div>
      </div>
    </div>
    <footer
      v-if="modalData.multiple"
      class="shrink-0 border-t border-border-1 bg-bg-2 py-xs"
      data-library-tray
    >
      <div class="mx-auto flex max-w-280 items-center gap-xs px-sm sm:px-md">
        <!-- What is chosen, in the order chosen; a click lets one go. Under
             a finger each says so by a small ✕ in its corner, so that it
             is not read as the square ✕ beside them, which lets all go. -->
        <ul
          class="flex scrollbar-clear min-w-0 flex-1 gap-xs overflow-x-auto
            py-1"
        >
          <li v-for="asset in selected" :key="asset.assetUuid" class="shrink-0">
            <button
              type="button"
              :disabled="selecting"
              :aria-label="`${phrase.asset_library_unselect}: ${assetFileLabel(asset)}`"
              :data-title-popup="phrase.asset_library_unselect"
              class="block size-10 cursor-pointer"
              @click="
                selected = selected.filter(
                  (a) => a.assetUuid !== asset.assetUuid,
                )
              "
            >
              <AssetTile
                :media="asset.media"
                :extension="asset.extension || '?'"
                class="size-full"
              >
                <template #overlay>
                  <span
                    class="absolute inset-0 z-40 flex items-center
                      justify-center bg-bg-1/60 opacity-0 transition
                      pointer-coarse:hidden hocus:opacity-100"
                  >
                    <Icon name="close" />
                  </span>
                  <span
                    class="absolute top-0.5 right-0.5 z-40 hidden size-5
                      items-center justify-center rounded-full bg-bg-1/85
                      text-2xs text-text-1 pointer-coarse:flex"
                  >
                    <Icon name="close" />
                  </span>
                </template>
              </AssetTile>
            </button>
          </li>
        </ul>
        <Button
          v-if="selected.length"
          variant="secondary"
          size="icon"
          class="pointer-coarse:size-11"
          :disabled="selecting"
          :aria-label="phrase.asset_library_clear_selection"
          :data-title-popup="phrase.asset_library_clear_selection"
          data-library-clear
          @click="selected = []"
          ><Icon name="close"
        /></Button>
        <Button
          variant="primary"
          class="flex h-9 shrink-0 items-center gap-xs whitespace-nowrap
            pointer-coarse:h-11"
          :disabled="!selected.length || selecting"
          data-library-insert
          @click="insertSelected"
          >{{ phrase.asset_library_insert
          }}<span v-if="selected.length" class="tabular-nums"
            >&nbsp;· {{ selected.length }}</span
          ></Button
        >
      </div>
    </footer>
  </section>
</template>
