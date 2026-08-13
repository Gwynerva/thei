<script lang="ts" setup>
import type {
  ContentAssetData,
  ContentMediaLayout,
} from '#layers/thei/shared/content';

defineProps<{
  asset: ContentAssetData | null;
  layout: ContentMediaLayout;
  label: string;
  readOnly?: boolean;
}>();

const emit = defineEmits<{
  pick: [];
  edit: [];
}>();
</script>

<template>
  <div v-if="asset" class="relative min-w-0">
    <ContentMedia :asset :layout />
    <button
      v-if="!readOnly"
      type="button"
      class="absolute top-xs right-xs z-40 flex size-9 cursor-pointer items-center
        justify-center rounded-full bg-bg-1/80 text-text-2 shadow
        backdrop-blur-sm transition hocus:bg-bg-1 hocus:text-text-1"
      :aria-label="label"
      @click.stop="emit('edit')"
    >
      <Icon name="edit" />
    </button>
  </div>
  <button
    v-else
    type="button"
    class="group flex aspect-video min-h-34 w-full items-center justify-center
      overflow-hidden rounded-normal bg-bg-accent text-accent/45
      transition-colors outline-none hocus:bg-accent/20 hocus:text-accent"
    :disabled="readOnly"
    :aria-label="label"
    @click="emit('pick')"
  >
    <Icon name="media" class="text-6xl transition-colors" aria-hidden="true" />
  </button>
</template>
