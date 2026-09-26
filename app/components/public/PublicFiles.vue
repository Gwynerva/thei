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
/**
 * Pictures and videos open in the viewer, together, so it can step between
 * them. Any other file has nothing to show there: it is simply downloaded.
 */
const openable = computed(() =>
  props.files.filter(
    (file): file is PublicFile => !isPublicSecret(file) && !!file.media,
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
        :title="file.title"
        :description="file.summary"
        :icon-media="file.iconMedia"
        secret
      />
      <PublicCompactResourceItem
        v-else-if="file.media"
        :title="file.title || phrase.asset"
        :description="file.description"
        :icon-media="file.media"
        icon="media"
        button
        @activate="openPublicAssets(openable, file)"
      />
      <PublicCompactResourceItem
        v-else
        :title="file.title || phrase.asset"
        :description="file.description"
        :extension="file.extension"
        :href="sitePath(file.href)"
        icon="file"
        download
      />
    </template>
  </div>
</template>
