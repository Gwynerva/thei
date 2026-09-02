<script lang="ts" setup>
import type { PublicAssetDescriptor } from '#layers/thei/shared/api/public';
import { publicAssetModal } from '#layers/thei/app/modals/public-asset/modal';

const props = withDefaults(
  defineProps<{
    items: PublicAssetDescriptor[];
    variant?: 'default' | 'hero';
  }>(),
  { variant: 'default' },
);
const selectedKey = ref(props.items[0]?.key);
const active = computed(
  () =>
    props.items.find((item) => item.key === selectedKey.value) ??
    props.items[0],
);
function openActive() {
  if (active.value) void openModal(publicAssetModal, active.value);
}
function openItem(item: PublicAssetDescriptor) {
  void openModal(publicAssetModal, item);
}
</script>

<template>
  <div v-if="variant === 'hero'" class="flex min-w-0 flex-wrap gap-xs">
    <button
      v-for="item in items"
      :key="item.key"
      type="button"
      class="group relative size-24 shrink-0 cursor-zoom-in overflow-hidden
        rounded-normal bg-black/16 shadow-md ring-1 ring-white/15 transition
        sm:size-30 hocus:-translate-y-0.5 hocus:bg-black/24 hocus:shadow-xl
        hocus:ring-white/35"
      :aria-label="item.title"
      :data-title-popup="item.title"
      @click="openItem(item)"
    >
      <Media v-if="item.media" v-bind="item.media" class="size-full" />
      <FilePreview v-else :extension="item.extension" class="size-full p-xs" />
      <span
        class="absolute inset-0 bg-black/0 transition group-hocus:bg-black/8"
        aria-hidden="true"
      ></span>
    </button>
  </div>
  <section
    v-if="variant === 'default' && active"
    class="flex min-w-0 flex-col gap-xs"
  >
    <div class="flex scrollbar-mini gap-xs overflow-x-auto pb-1">
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        class="size-18 shrink-0 cursor-pointer overflow-hidden rounded-normal
          border-2 bg-bg-3 transition"
        :class="
          item.key === active.key ? 'border-accent' : 'border-transparent'
        "
        :aria-pressed="item.key === active.key"
        :aria-label="item.title"
        @click="selectedKey = item.key"
      >
        <Media v-if="item.media" v-bind="item.media" class="size-full" />
        <FilePreview
          v-else
          :extension="item.extension"
          class="size-full p-xs"
        />
      </button>
    </div>
    <figure class="min-w-0 overflow-hidden rounded-normal bg-bg-3">
      <button
        type="button"
        class="group relative block w-full cursor-zoom-in"
        :aria-label="active.title"
        @click="openActive"
      >
        <Media
          v-if="active.media"
          v-bind="active.media"
          class="max-h-144 min-h-48 w-full"
        />
        <FilePreview
          v-else
          :extension="active.extension"
          class="m-auto size-32 p-md"
        />
        <span
          class="absolute right-xs bottom-xs flex size-9 items-center
            justify-center rounded-full bg-bg-1/80 text-text-2 shadow
            backdrop-blur-sm transition group-hocus:bg-bg-1
            group-hocus:text-text-1"
          ><Icon name="visibility"
        /></span>
      </button>
      <figcaption
        v-if="active.description"
        class="px-xs py-2 text-sm text-text-2"
      >
        {{ active.description }}
      </figcaption>
    </figure>
  </section>
</template>
