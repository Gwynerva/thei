<script lang="ts" setup>
import {
  isPublicSecret,
  type PublicAssetDescriptor,
  type PublicSecretReference,
} from '#layers/thei/shared/api/public';
import { openPublicAssets } from '#layers/thei/app/modals/public-asset/modal';

const props = withDefaults(
  defineProps<{
    items: (PublicAssetDescriptor | PublicSecretReference)[];
    variant?: 'default' | 'hero';
  }>(),
  { variant: 'default' },
);
// A secret keeps its place in the row, but there is nothing to select or open.
const openable = computed(() =>
  props.items.filter(
    (item): item is PublicAssetDescriptor => !isPublicSecret(item),
  ),
);
const selectedKey = ref(openable.value[0]?.key);
const active = computed(
  () =>
    openable.value.find((item) => item.key === selectedKey.value) ??
    openable.value[0],
);
function openItem(item: PublicAssetDescriptor) {
  openPublicAssets(openable.value, item);
}
</script>

<template>
  <div
    v-if="variant === 'hero'"
    class="flex min-w-0 flex-wrap justify-center gap-md sm:justify-start"
  >
    <template v-for="item in items" :key="item.key">
      <PublicSecretIcon
        v-if="isPublicSecret(item)"
        :secret="item"
        class="size-24 shrink-0 rounded-normal border-2 border-white/15
          shadow-md sm:size-30"
      />
      <PublicAssetGalleryTile v-else :item @open="openItem(item)" />
    </template>
  </div>
  <section
    v-if="variant === 'default' && items.length"
    class="flex min-w-0 flex-col gap-xs"
  >
    <div class="flex scrollbar-mini gap-xs overflow-x-auto pb-1">
      <template v-for="item in items" :key="item.key">
        <PublicSecretIcon
          v-if="isPublicSecret(item)"
          :secret="item"
          class="size-18 shrink-0 rounded-normal border-2 border-transparent"
        />
        <button
          v-else
          type="button"
          class="size-18 shrink-0 cursor-pointer overflow-hidden rounded-normal
            border-2 bg-bg-3 transition"
          :class="
            item.key === active?.key ? 'border-accent' : 'border-transparent'
          "
          :aria-pressed="item.key === active?.key"
          :aria-label="publicText(item.title) || phrase.asset"
          @click="selectedKey = item.key"
        >
          <Media
            v-if="item.media"
            v-bind="item.media"
            fit="contain"
            backdrop
            class="size-full"
          />
          <FilePreview
            v-else
            :extension="item.extension"
            class="size-full p-xs"
          />
        </button>
      </template>
    </div>
    <!-- A tile switches the picture at once, as the content gallery does. -->
    <PublicAssetGalleryView
      v-if="active"
      :key="active.key"
      :item="active"
      data-gallery-view
      @open="openItem(active)"
    />
  </section>
</template>
