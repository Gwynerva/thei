<script setup lang="ts">
import { debounce } from 'perfect-debounce';
import type { ExtensionProfile } from '#layers/thei/shared/assets/extensions';
import {
  getPathExtension,
  isExtensionAllowed,
} from '#layers/thei/shared/assets/extensions';
import ModalBackButton from '../ModalBackButton.vue';
import type { PickedFile, PickedFiles } from './picked-file';

const props = defineProps<{
  modalData: {
    accept: string | ExtensionProfile | (string | ExtensionProfile)[];
    maxSize?: number;
    multiple?: boolean;
    backLabel?: string;
  };
}>();

const emit = defineEmits<{
  modalResult: [result: PickedFile | PickedFiles];
}>();

const humanSize = useHumanSize();

const errorMessage = ref('');
const dragging = ref(false);
const stopDragging = debounce(() => {
  dragging.value = false;
}, 50);
const fileInput = useTemplateRef('file');

const acceptArray = computed(() => {
  const { accept } = props.modalData;
  if (Array.isArray(accept)) return accept;
  return [accept];
});

/** Native <input accept=""> attribute value built from acceptArray. */
const acceptAttr = computed(() => {
  const exts: string[] = [];
  let acceptAll = false;
  for (const item of acceptArray.value) {
    if (typeof item === 'string') {
      exts.push(`.${item}`);
    } else if (item.extensions === '*') {
      acceptAll = true;
      break;
    } else {
      for (const ext of item.extensions as readonly string[]) {
        exts.push(`.${ext}`);
      }
    }
  }
  return acceptAll ? '' : exts.join(',');
});

function validateFile(
  file: File,
): { file: PickedFile } | { error: { fileName: string; message: string } } {
  const ext = getPathExtension(file.name);

  if (!isExtensionAllowed(ext, props.modalData.accept)) {
    return {
      error: {
        fileName: file.name,
        message: phrase.value.file_wrong_type(ext || '?'),
      },
    };
  }

  if (
    props.modalData.maxSize !== undefined &&
    file.size > props.modalData.maxSize
  ) {
    return {
      error: {
        fileName: file.name,
        message: phrase.value.file_too_large(humanSize(file.size)),
      },
    };
  }

  return {
    file: {
      type: 'picked-file',
      objectUrl: URL.createObjectURL(file),
      file,
      extension: ext,
      size: file.size,
      name: file.name,
    },
  };
}

function validateAndEmit(files: File[]) {
  if (!files.length) return;
  const results = files.map(validateFile);
  const accepted = results.flatMap((result) =>
    'file' in result ? [result.file] : [],
  );
  const errors = results.flatMap((result) =>
    'error' in result ? [result.error] : [],
  );

  if (!props.modalData.multiple) {
    const result = results[0]!;
    if ('error' in result) {
      errorMessage.value = result.error.message;
      return;
    }
    errorMessage.value = '';
    emit('modalResult', result.file);
    return;
  }

  if (!accepted.length) {
    errorMessage.value = errors.map((error) => error.message).join(' · ');
    return;
  }
  errorMessage.value = '';
  emit('modalResult', { type: 'picked-files', files: accepted, errors });
}

function browse() {
  fileInput.value?.click();
}

function onFileInput(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files ?? []);
  validateAndEmit(files);

  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

function handleDrop(e: DragEvent) {
  stopDragging.cancel();
  dragging.value = false;
  validateAndEmit(Array.from(e.dataTransfer?.files ?? []));
}

function handlePaste(e: ClipboardEvent) {
  validateAndEmit(Array.from(e.clipboardData?.files ?? []));
}

onMounted(() => document.addEventListener('paste', handlePaste));
onUnmounted(() => document.removeEventListener('paste', handlePaste));
</script>

<template>
  <section
    @click="browse()"
    @dragover.prevent="
      dragging = true;
      stopDragging.cancel();
    "
    @dragleave="stopDragging()"
    @drop.prevent="handleDrop"
    :data-dragging="dragging ? '' : undefined"
    class="group absolute h-dvh w-dvw cursor-pointer bg-bg-1 p-md backdrop-blur
      select-none sm:p-lg"
  >
    <div
      class="absolute top-0 left-0 h-full w-full bg-transparent transition
        group-data-dragging:bg-accent/15"
    ></div>

    <div
      class="relative flex h-full w-full flex-col items-center justify-center
        gap-md overflow-clip rounded-xl border-4 border-dashed border-border-1
        p-md text-center transition group-data-dragging:border-accent!
        group-hocus:border-border-2 sm:gap-lg sm:border-8 sm:p-lg"
    >
      <ModalBackButton
        v-if="modalData.backLabel || modalBackLabel"
        :target="modalData.backLabel || modalBackLabel!"
        class="absolute top-sm left-sm"
        floating
        @click.stop
      />

      <button
        type="button"
        @click.stop="closeModal"
        :aria-label="phrase.close_modal"
        class="absolute top-sm right-sm cursor-pointer rounded-full
          bg-transparent p-xs text-3xl text-text-3 transition sm:p-sm
          hocus:bg-bg-3 hocus:text-text-1"
      >
        <Icon name="close" />
      </button>

      <div v-if="errorMessage" class="text-xl font-semibold text-text-error">
        <Icon name="warning" class="mr-xs" />
        <span>{{ errorMessage }}</span>
      </div>
      <div
        class="group/icon rounded-full border-2 border-border-1/50 bg-bg-2 p-md
          shadow-lg shadow-black/20 transition
          group-data-dragging:border-accent! group-data-dragging:bg-bg-1!
          sm:p-lg hocus:bg-bg-3"
      >
        <Icon
          name="upload"
          class="text-5xl text-text-2 transition
            group-data-dragging:text-accent! group-hocus/icon:text-text-1
            sm:text-9xl"
        />
      </div>
      <div
        class="text-xl font-bold text-text-2 transition
          group-data-dragging:text-accent! group-hocus:text-text-1 sm:text-3xl"
      >
        {{ phrase.drop_browse_paste }}
      </div>
      <div class="flex flex-col gap-md sm:text-xl">
        <div
          class="flex flex-wrap items-center justify-center gap-sm
            font-semibold"
        >
          <div class="text-text-3">
            {{ phrase.format }}
          </div>
          <div class="text-text-2">
            <template v-for="(accept, index) in acceptArray" :key="index">
              <span v-if="typeof accept === 'string'" class="font-mono">
                {{ accept }}
              </span>
              <span v-else>
                {{ phrase[accept.title] }}
              </span>
              <span v-if="index < acceptArray.length - 1">, </span>
            </template>
          </div>
        </div>

        <div
          v-if="modalData.maxSize"
          class="flex flex-wrap items-center justify-center gap-sm
            font-semibold"
        >
          <div class="text-text-3">
            {{ phrase.max_size }}
          </div>
          <div class="text-text-2">
            {{ humanSize(modalData.maxSize) }}
          </div>
        </div>
      </div>
    </div>

    <input
      ref="file"
      type="file"
      :multiple="modalData.multiple"
      class="hidden"
      :accept="acceptAttr"
      @click.stop
      @change="onFileInput"
    />
  </section>
</template>
