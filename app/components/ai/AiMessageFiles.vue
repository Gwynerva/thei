<script lang="ts" setup>
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import type { AiMessageFile } from '#layers/thei/shared/ai';
import { libraryAssetDetailsModal } from '#layers/thei/app/modals/asset-library/details-modal';

/**
 * The files of a message: what the owner brought along, or what the model
 * made. Each opens in the library's window of it, where its place is told.
 */
defineProps<{ files: AiMessageFile[] }>();

const humanSize = useHumanSize();

function openFile(asset: AssetVariantInfo) {
  void openModal(libraryAssetDetailsModal, { asset });
}
</script>

<template>
  <!-- The files brought along: a picture or a video by its preview, any
       other file by its name; each opens in the library's window of it. -->
  <div v-if="files.length" class="flex flex-wrap gap-1.5" data-message-files>
    <template v-for="(file, index) in files" :key="index">
      <button
        v-if="file.asset?.media"
        type="button"
        class="block size-20 cursor-pointer overflow-hidden rounded-normal
          bg-bg-3 transition-opacity hocus:opacity-85"
        :aria-label="file.name"
        :data-title-popup="file.name"
        data-message-file
        @click="openFile(file.asset)"
      >
        <img
          :src="sitePath(file.asset.media.previewSrc)"
          alt=""
          loading="lazy"
          class="size-full object-cover"
        />
      </button>
      <button
        v-else-if="file.asset"
        type="button"
        class="flex max-w-60 min-w-0 cursor-pointer items-center gap-2
          rounded-normal bg-bg-1/60 py-1.5 pr-3 pl-2.5 text-left
          transition-colors hocus:bg-bg-1"
        data-message-file
        @click="openFile(file.asset)"
      >
        <Icon
          :name="file.asset.type === 'audio' ? 'audio' : 'file'"
          class="shrink-0 text-lg text-text-2"
        />
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-xs font-semibold">{{ file.name }}</span>
          <span class="text-2xs text-text-2"
            >{{ file.asset.extension.toUpperCase() }} ·
            {{ humanSize(file.asset.size) }}</span
          >
        </span>
      </button>
      <span
        v-else
        class="flex max-w-60 min-w-0 items-center gap-2 rounded-normal border
          border-dashed border-border-2 py-1.5 pr-3 pl-2.5 text-text-3"
        data-message-file="gone"
      >
        <Icon name="missing" class="shrink-0 text-lg" />
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-xs">{{ file.name }}</span>
          <span class="text-2xs">{{ phrase.ai_message_file_gone }}</span>
        </span>
      </span>
    </template>
  </div>
</template>
