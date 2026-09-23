<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicFile,
  type PublicSecretReference,
} from '#layers/thei/shared/api/public';
import { openPublicAssets } from '#layers/thei/app/modals/public-asset/modal';

const props = withDefaults(
  defineProps<{
    files: (PublicFile | PublicSecretReference)[];
    compact?: boolean;
  }>(),
  { compact: false },
);
/** The files of one list open together, so the viewer can step between them. */
const openable = computed(() =>
  props.files.filter((file): file is PublicFile => !isPublicSecret(file)),
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
        @activate="openPublicAssets(openable, file)"
      />
    </template>
  </div>
</template>
