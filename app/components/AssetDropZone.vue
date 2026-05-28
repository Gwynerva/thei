<script lang="ts" setup>
/**
 * Unified drop / browse zone for all asset upload contexts.
 *
 * Renders the drop target, opens the native file picker on click,
 * and displays accepted format label + max size info.
 *
 * The component manages its own <input type="file"> internally.
 * When a file is selected (drag-drop or browse) it emits `file`.
 */

const props = defineProps<{
  formatLabel: string;
  maxSizeBytes: number;
  hint?: string | null;
  accept?: string;
}>();

const emit = defineEmits<{ file: [File] }>();

const isDragging = ref(false);
const fileInputRef = ref<HTMLInputElement>();
const formatSize = useHumanSize();

function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) emit('file', file);
  if (fileInputRef.value) fileInputRef.value.value = '';
}

function onDrop(e: DragEvent) {
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) emit('file', file);
}
</script>

<template>
  <div
    class="group flex min-h-36 cursor-pointer flex-col items-center
      justify-center gap-sm rounded-normal border-3 border-dashed p-md
      transition select-none hocus:border-border-3"
    :data-drag-hover="isDragging ? '' : undefined"
    :class="
      isDragging ? 'border-accent bg-bg-accent/60' : 'border-border-1 bg-bg-1'
    "
    @click="fileInputRef?.click()"
    @dragover.prevent="isDragging = true"
    @dragleave="isDragging = false"
    @drop.prevent="onDrop"
  >
    <Icon
      name="upload"
      class="text-4xl text-text-2 transition group-data-drag-hover:text-accent
        group-hocus:text-text-1"
    />
    <span class="text-center text-sm text-text-2">
      {{ phrase.asset_upload_drop_hint }}
    </span>
    <div class="flex flex-col items-center gap-0.5 text-xs text-text-3">
      <p v-if="hint" class="text-center text-sm" v-html="hint" />
      <span>
        <span class="font-semibold">{{ phrase.file_formats }}</span>
        &nbsp;{{ formatLabel }}
      </span>
      <span>
        <span class="font-semibold">{{ phrase.file_max_size }}</span>
        &nbsp;{{ formatSize(maxSizeBytes) }}
      </span>
    </div>
  </div>
  <input
    ref="fileInputRef"
    type="file"
    class="hidden"
    :accept="accept"
    @change="onFileInput"
  />
</template>
