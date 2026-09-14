<script setup lang="ts">
import { debounce } from 'perfect-debounce';
import type { ExtensionProfile } from '#layers/thei/shared/assets/extensions';
import {
  getPathExtension,
  isExtensionAllowed,
} from '#layers/thei/shared/assets/extensions';
import type { PickedFile, PickedFiles } from './picked-file';
import { hashLocalAsset } from '../../composables/asset-hash';
import type { AssetVariantInfo } from '#layers/thei/shared/api/asset';
import type { AssetLibraryAvailability } from '#layers/thei/shared/asset-library';
import type { AssetUploadLimitPolicy } from '#layers/thei/shared/asset-upload-limits';

const props = defineProps<{
  modalData: {
    accept: string | ExtensionProfile | (string | ExtensionProfile)[];
    maxSize?: number;
    multiple?: boolean;
    notice?: string;
    acceptedExtensions?: string[] | '*';
    sizeLimitPolicy?: AssetUploadLimitPolicy;
    imageOnly?: boolean;
  };
}>();

const emit = defineEmits<{
  modalResult: [result: PickedFile | PickedFiles | { type: 'library' }];
}>();

const humanSize = useHumanSize();
const availabilityQuery = computed(() => ({
  acceptedExtensions:
    props.modalData.acceptedExtensions === '*'
      ? '*'
      : props.modalData.acceptedExtensions
        ? JSON.stringify(props.modalData.acceptedExtensions)
        : undefined,
  sizeLimitPolicy: props.modalData.sizeLimitPolicy,
  imageOnly: props.modalData.imageOnly || undefined,
}));
const { data: availability } = useFetch<AssetLibraryAvailability>(
  '/api/admin/assets/availability',
  { query: availabilityQuery },
);
const canReuse = computed(() => Boolean(availability.value?.total));

const errorMessage = ref(props.modalData.notice ?? '');
const checking = ref(false);
const hashProgress = ref(0);
const checkingName = ref('');
let checkController: AbortController | undefined;
onBeforeUnmount(() => checkController?.abort());
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

async function validateAndEmit(files: File[]) {
  if (checking.value) return;
  if (!files.length) return;
  if (!props.modalData.multiple) files = files.slice(0, 1);
  const results = files.map(validateFile);
  const accepted = results.flatMap((result) =>
    'file' in result ? [result.file] : [],
  );
  const errors = results.flatMap((result) =>
    'error' in result ? [result.error] : [],
  );

  if (accepted.length) {
    checking.value = true;
    errorMessage.value = '';
    const controller = new AbortController();
    checkController = controller;
    try {
      for (const picked of accepted) {
        checkingName.value = picked.name;
        hashProgress.value = 0;
        const hash = await hashLocalAsset(
          picked.file,
          controller.signal,
          (value) => {
            hashProgress.value = value;
          },
        );
        const response = await $fetch<{ asset: AssetVariantInfo | null }>(
          '/api/admin/assets/lookup',
          {
            method: 'POST',
            body: { hash, size: picked.size },
            signal: controller.signal,
          },
        );
        picked.existingAsset = response.asset ?? undefined;
      }
    } catch (error) {
      for (const picked of accepted) URL.revokeObjectURL(picked.objectUrl);
      if (!controller.signal.aborted)
        errorMessage.value = phrase.value.asset_hash_error;
      return;
    } finally {
      checking.value = false;
    }
  }

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
  if (checking.value) return;
  fileInput.value?.click();
}

function browseFromKeyboard(event: KeyboardEvent) {
  if (checking.value) return;
  event.preventDefault();
  browse();
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
  <section class="absolute flex h-dvh w-dvw flex-col bg-bg-1 backdrop-blur">
    <header
      class="flex shrink-0 items-center justify-between gap-sm border-b
        border-border-1 bg-bg-2 p-sm sm:p-md"
    >
      <div class="flex min-w-0 flex-wrap items-center gap-x-md gap-y-xs">
        <div class="flex min-w-0 items-baseline gap-xs font-semibold">
          <span class="shrink-0 text-text-3">{{ phrase.format }}</span>
          <span class="min-w-0 text-text-2">
            <template v-for="(accept, index) in acceptArray" :key="index">
              <span v-if="typeof accept === 'string'" class="font-mono">
                {{ accept }}
              </span>
              <span v-else>{{ phrase[accept.title] }}</span>
              <span v-if="index < acceptArray.length - 1">, </span>
            </template>
          </span>
        </div>
        <div
          v-if="modalData.maxSize"
          class="flex items-baseline gap-xs font-semibold"
        >
          <span class="text-text-3">{{ phrase.max_size }}</span>
          <span class="text-text-2">{{ humanSize(modalData.maxSize) }}</span>
        </div>
      </div>
      <button
        type="button"
        :aria-label="phrase.close_modal"
        class="shrink-0 cursor-pointer rounded-normal p-xs text-xl text-text-3
          transition hocus:bg-bg-3 hocus:text-text-1"
        @click="closeModal"
      >
        <Icon name="close" />
      </button>
    </header>

    <div
      class="flex min-h-0 flex-1 flex-col gap-sm p-sm select-none sm:flex-row
        sm:p-md"
    >
      <div
        role="button"
        tabindex="0"
        :aria-label="phrase.asset_pick_upload"
        :aria-disabled="checking"
        :data-dragging="dragging ? '' : undefined"
        class="group/upload relative flex min-h-0 flex-1 cursor-pointer flex-col
          items-center justify-center gap-md overflow-clip rounded-xl border-4
          border-dashed border-border-1 p-md text-center transition
          aria-disabled:cursor-wait aria-disabled:opacity-70
          data-dragging:border-accent! data-dragging:bg-accent/15 sm:gap-lg
          sm:border-8 sm:p-lg hocus:border-border-2"
        @click="browse"
        @keydown.enter="browseFromKeyboard"
        @keydown.space="browseFromKeyboard"
        @dragover.prevent="
          dragging = true;
          stopDragging.cancel();
        "
        @dragleave="stopDragging()"
        @drop.prevent="handleDrop"
      >
        <div v-if="errorMessage" class="text-xl font-semibold text-text-error">
          <Icon name="warning" class="mr-xs" />
          <span>{{ errorMessage }}</span>
        </div>
        <div
          v-if="checking"
          role="status"
          class="flex max-w-full flex-col gap-xs text-text-2"
        >
          <span
            >{{ phrase.asset_hash_check }} ·
            {{ Math.round(hashProgress * 100) }}%</span
          >
          <span class="truncate text-sm">{{ checkingName }}</span>
          <progress
            :value="hashProgress"
            max="1"
            class="w-full accent-accent"
          />
          <button
            type="button"
            class="cursor-pointer text-sm underline"
            @click.stop="checkController?.abort()"
          >
            {{ phrase.close_modal }}
          </button>
        </div>
        <div
          class="group/icon rounded-full border-2 border-border-1/50 bg-bg-2
            p-md shadow-lg shadow-black/20 transition
            group-data-dragging/upload:border-accent!
            group-data-dragging/upload:bg-bg-1! group-hocus/upload:bg-bg-3
            sm:p-lg"
        >
          <Icon
            name="upload"
            class="text-5xl text-text-2 transition
              group-data-dragging/upload:text-accent!
              group-hocus/upload:text-text-1 sm:text-8xl"
          />
        </div>
        <div
          class="text-xl font-bold text-text-2 transition
            group-data-dragging/upload:text-accent!
            group-hocus/upload:text-text-1 sm:text-3xl"
        >
          {{ phrase.asset_pick_upload }}
        </div>
        <div class="text-sm font-semibold text-text-3 sm:text-base">
          {{ phrase.drop_browse_paste }}
        </div>
      </div>

      <button
        v-if="canReuse"
        type="button"
        :disabled="checking"
        :aria-label="phrase.asset_pick_reuse"
        class="group/reuse flex min-h-0 flex-1 cursor-pointer flex-col
          items-center justify-center gap-md overflow-clip rounded-xl border-4
          border-dashed border-border-1 p-md text-center transition
          disabled:cursor-wait disabled:opacity-70 sm:gap-lg sm:border-8 sm:p-lg
          hocus:border-border-2"
        @click="emit('modalResult', { type: 'library' })"
      >
        <span
          class="rounded-full border-2 border-border-1/50 bg-bg-2 p-md text-5xl
            text-text-2 shadow-lg shadow-black/20 transition
            group-hocus/reuse:bg-bg-3 group-hocus/reuse:text-text-1 sm:p-lg
            sm:text-8xl"
        >
          <Icon name="gallery" />
        </span>
        <span
          class="text-xl font-bold text-text-2 transition
            group-hocus/reuse:text-text-1 sm:text-3xl"
        >
          {{ phrase.asset_pick_reuse }}
        </span>
        <span class="text-sm font-semibold text-text-3 sm:text-base">
          {{ phrase.asset_pick_reuse_hint }}
        </span>
      </button>
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
