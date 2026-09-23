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
const crossfade = useGalleryCrossfade(active, (item) => item.key);
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
      <button
        v-else
        type="button"
        class="group relative size-24 shrink-0 cursor-zoom-in overflow-hidden
          rounded-normal border-2 border-white/15 bg-black/16 shadow-md
          transition sm:size-30 hocus:-translate-y-0.5 hocus:border-white/35
          hocus:bg-black/24 hocus:shadow-xl"
        :aria-label="item.title || phrase.asset"
        :data-title-popup="item.title || phrase.asset"
        @click="openItem(item)"
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
        <span
          class="absolute inset-0 bg-black/0 transition group-hocus:bg-black/8"
          aria-hidden="true"
        ></span>
      </button>
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
          :aria-label="item.title || phrase.asset"
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
    <div v-if="crossfade.displayed.value" class="grid" data-gallery-crossfade>
      <PublicAssetGalleryView
        v-for="layer in crossfade.layers.value"
        :key="layer.item.key"
        :item="layer.item"
        :suspended="
          layer.role === 'displayed'
            ? Boolean(crossfade.incoming.value)
            : !crossfade.revealing.value
        "
        :inert="
          layer.role === 'displayed'
            ? Boolean(crossfade.incoming.value)
            : !crossfade.revealing.value
        "
        class="col-start-1 row-start-1 transition-opacity duration-300
          motion-reduce:duration-0"
        :class="{
          'pointer-events-none opacity-0':
            layer.role === 'displayed'
              ? crossfade.revealing.value
              : !crossfade.revealing.value,
          'pointer-events-auto opacity-100':
            layer.role === 'incoming' && crossfade.revealing.value,
        }"
        :data-gallery-outgoing="layer.role === 'displayed' ? '' : undefined"
        :data-gallery-incoming="layer.role === 'incoming' ? '' : undefined"
        @ready="
          layer.role === 'incoming' && crossfade.settleIncoming(layer.item.key)
        "
        @error="
          layer.role === 'incoming' && crossfade.settleIncoming(layer.item.key)
        "
        @open="openItem(layer.item)"
      />
    </div>
  </section>
</template>
