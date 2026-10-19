<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicFile,
  type PublicSecretReference,
} from '#layers/thei/shared/api/public';
import { isAssetPreviewable } from '#layers/thei/shared/assets/preview';
import { openPublicAssets } from '#layers/thei/app/modals/public-asset/modal';

const props = withDefaults(
  defineProps<{
    files: (PublicFile | PublicSecretReference)[];
    compact?: boolean;
  }>(),
  { compact: false },
);
/**
 * A file with something to show — a picture, a video, a text, a table, a
 * page, a PDF, an archive's list — opens in the viewer, all of them
 * together, so it can step between them. Any other file is downloaded.
 */
function viewable(file: PublicFile) {
  return (
    !!file.media || isAssetPreviewable(file.extension, file.archivedOriginal)
  );
}
const openable = computed(() =>
  props.files.filter(
    (file): file is PublicFile => !isPublicSecret(file) && viewable(file),
  ),
);
</script>

<template>
  <div
    v-if="files.length"
    class="grid gap-xs"
    :class="{ 'sm:grid-cols-2': !compact }"
  >
    <template v-for="file in files" :key="file.key">
      <PublicCompactResourceItem
        v-if="isPublicSecret(file)"
        :title="publicText(file.title)"
        :description="publicText(file.summary)"
        :icon-media="file.iconMedia"
        secret
      />
      <PublicCompactResourceItem
        v-else-if="file.media"
        :title="publicText(file.title) || phrase.asset"
        :description="publicText(file.description)"
        :icon-media="file.media"
        icon="media"
        button
        :data-file="file.key"
        data-opens-viewer
        @activate="openPublicAssets(openable, file)"
      />
      <PublicCompactResourceItem
        v-else-if="viewable(file)"
        :title="publicText(file.title) || phrase.asset"
        :description="publicText(file.description)"
        :extension="file.extension"
        icon="file"
        button
        :data-file="file.key"
        data-opens-viewer
        @activate="openPublicAssets(openable, file)"
      />
      <PublicCompactResourceItem
        v-else
        :title="publicText(file.title) || phrase.asset"
        :description="publicText(file.description)"
        :extension="file.extension"
        :href="sitePath(file.href)"
        icon="file"
        download
        :data-file="file.key"
      />
    </template>
  </div>
</template>
