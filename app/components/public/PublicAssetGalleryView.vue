<script lang="ts" setup>
import type { PublicAssetDescriptor } from '#layers/thei/shared/api/public';

const props = defineProps<{
  item: PublicAssetDescriptor;
  suspended?: boolean;
}>();
const emit = defineEmits<{ ready: []; error: []; open: [] }>();

onMounted(() => {
  if (!props.item.media) emit('ready');
});
</script>

<template>
  <figure class="min-w-0 overflow-hidden rounded-normal bg-bg-3">
    <component
      :is="item.media?.kind === 'video' ? 'div' : 'button'"
      :type="item.media?.kind === 'video' ? undefined : 'button'"
      class="group relative isolate block w-full"
      :class="{ 'cursor-zoom-in': item.media?.kind !== 'video' }"
      :aria-label="item.title || phrase.asset"
      @click="item.media?.kind !== 'video' && emit('open')"
    >
      <Media
        v-if="item.media"
        v-bind="item.media"
        fit="contain"
        backdrop
        :controls="item.media.kind === 'video'"
        :suspended
        class="max-h-144 min-h-48 w-full"
        @ready="emit('ready')"
        @error="emit('error')"
      />
      <FilePreview
        v-else
        :extension="item.extension"
        class="m-auto size-32 p-md"
      />
      <span
        v-if="item.media?.kind !== 'video'"
        class="absolute right-xs bottom-xs flex size-9 items-center
          justify-center rounded-full bg-bg-1/80 text-text-2 shadow
          backdrop-blur-sm transition group-hocus:bg-bg-1
          group-hocus:text-text-1"
        ><Icon name="visibility"
      /></span>
    </component>
    <figcaption v-if="item.title" class="px-xs py-2 text-sm text-text-2">
      {{ publicText(item.title) }}
    </figcaption>
  </figure>
</template>
