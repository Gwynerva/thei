<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicFile,
  type PublicSecretReference,
} from '#layers/thei/shared/api/public';
import { publicAssetModal } from '#layers/thei/app/modals/public-asset/modal';

withDefaults(
  defineProps<{
    files: (PublicFile | PublicSecretReference)[];
    compact?: boolean;
  }>(),
  { compact: false },
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
        :title="file.title"
        :description="file.summary"
        :icon-media="file.iconMedia"
        secret
      />
      <PublicCompactResourceItem
        v-else
        :title="file.title || phrase.asset"
        :description="file.description"
        :icon-media="file.media"
        :extension="file.media ? undefined : file.extension"
        :icon="file.media ? 'media' : 'file'"
        button
        @activate="openModal(publicAssetModal, file)"
      />
    </template>
  </div>
</template>
