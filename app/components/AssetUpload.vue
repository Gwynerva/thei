<script lang="ts" setup>
import type {
  AssetCheckRequest,
  AssetCheckResponse,
  AssetUploadResponse,
} from '#layers/thei/shared/api/asset';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';
import type {
  AssetProfileId,
  AssetUploadProfile,
} from '#layers/thei/shared/asset-profiles';
import { Modal } from '#components';

const props = defineProps<{ profileId: AssetProfileId }>();

const emit = defineEmits<{
  uploaded: [{ assetUuid: string; link: string; extension: string }];
}>();

const modelValue = defineModel<string>();

const profile = computed(() => ASSET_PROFILES[props.profileId]);

const profileHint = computed<string | null>(() => {
  const key = (profile.value as AssetUploadProfile).hintKey;
  if (!key) return null;
  const val = phrase.value[key];
  return typeof val === 'string' ? val : null;
});

const modalRef = ref<InstanceType<typeof Modal>>();
const fileInputRef = ref<HTMLInputElement>();
const isDragging = ref(false);
const activeXhr = ref<XMLHttpRequest>();

// ── State machine ────────────────────────────────────────────────────────────

type UploadState =
  | { type: 'idle' }
  | { type: 'hashing' }
  | { type: 'checking' }
  | { type: 'duplicate'; assetUuid: string; link: string; extension: string }
  | { type: 'uploading'; filename: string; size: number; progress: number }
  | { type: 'processing' }
  | { type: 'done'; result: AssetUploadResponse }
  | { type: 'error'; message: string };

const state = ref<UploadState>({ type: 'idle' });

// ── Dialog control ───────────────────────────────────────────────────────────

function open() {
  state.value = { type: 'idle' };
  modalRef.value?.open();
}

function close() {
  modalRef.value?.close();
}

function onDialogClose() {
  if (state.value.type === 'uploading' || state.value.type === 'processing') {
    activeXhr.value?.abort();
    activeXhr.value = undefined;
  }
  state.value = { type: 'idle' };
}

function retry() {
  state.value = { type: 'idle' };
}

const formatSize = useHumanSize();

async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const acceptAttr = computed(() => {
  const exts = profile.value.acceptedExtensions;
  if (exts === '*') return undefined;
  return (exts as string[]).map((e) => `.${e}`).join(',');
});

// ── Upload flow ──────────────────────────────────────────────────────────────

async function handleFile(file: File) {
  const ext = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : '';

  const exts = profile.value.acceptedExtensions;
  if (exts !== '*' && !(exts as string[]).includes(ext)) {
    state.value = {
      type: 'error',
      message: `File type .${ext} is not accepted. Allowed: ${(exts as string[]).join(', ')}`,
    };
    return;
  }
  if (file.size > profile.value.maxSizeBytes) {
    state.value = {
      type: 'error',
      message: `File is too large (${formatSize(file.size)}). Maximum: ${formatSize(profile.value.maxSizeBytes)}.`,
    };
    return;
  }

  state.value = { type: 'hashing' };
  let rawHash: string;
  try {
    rawHash = await hashFile(file);
  } catch {
    state.value = { type: 'error', message: 'Failed to calculate file hash.' };
    return;
  }

  state.value = { type: 'checking' };
  let checkResult: AssetCheckResponse;
  try {
    checkResult = await $fetch<AssetCheckResponse>('/api/admin/assets/check', {
      method: 'POST',
      body: {
        rawHash,
        profileId: props.profileId,
      } satisfies AssetCheckRequest,
    });
  } catch {
    state.value = { type: 'error', message: 'Failed to check for duplicate.' };
    return;
  }

  if (checkResult.exists) {
    state.value = { type: 'duplicate', ...checkResult };
    modelValue.value = checkResult.assetUuid;
    emit('uploaded', {
      assetUuid: checkResult.assetUuid,
      link: checkResult.link,
      extension: checkResult.extension,
    });
    setTimeout(close, 1500);
    return;
  }

  // XHR upload for progress events
  state.value = {
    type: 'uploading',
    filename: file.name,
    size: file.size,
    progress: 0,
  };
  const formData = new FormData();
  formData.append('file', file);
  formData.append('profileId', props.profileId);
  formData.append('rawHash', rawHash);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    activeXhr.value = xhr;
    xhr.open('POST', '/api/admin/assets/upload');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && state.value.type === 'uploading') {
        state.value = {
          type: 'uploading',
          filename: file.name,
          size: file.size,
          progress: e.loaded / e.total,
        };
      }
    });
    xhr.upload.addEventListener('load', () => {
      state.value = { type: 'processing' };
    });

    xhr.addEventListener('load', () => {
      activeXhr.value = undefined;
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const result: AssetUploadResponse = JSON.parse(xhr.responseText);
          state.value = { type: 'done', result };
          modelValue.value = result.assetUuid;
          emit('uploaded', result);
          resolve();
        } catch {
          state.value = { type: 'error', message: 'Invalid server response.' };
          reject();
        }
      } else {
        const msg = (() => {
          try {
            return (JSON.parse(xhr.responseText) as { message?: string })
              .message;
          } catch {
            return null;
          }
        })();
        state.value = {
          type: 'error',
          message: msg ?? `Upload failed (${xhr.status})`,
        };
        reject();
      }
    });
    xhr.addEventListener('error', () => {
      activeXhr.value = undefined;
      state.value = { type: 'error', message: 'Network error during upload.' };
      reject();
    });
    xhr.addEventListener('abort', () => {
      activeXhr.value = undefined;
      reject();
    });

    xhr.send(formData);
  }).catch(() => {});
}

function onFileInput(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) handleFile(file);
  if (fileInputRef.value) fileInputRef.value.value = '';
}

function onDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) handleFile(file);
}

function onDragover(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}
</script>

<template>
  <!-- Trigger — whatever is slotted becomes the clickable opener -->
  <span class="cursor-pointer" @click="open"><slot /></span>

  <Modal ref="modalRef" :title="profile.label" @close="onDialogClose">
    <!-- idle: drop zone -->
    <template v-if="state.type === 'idle'">
      <div
        class="relative flex cursor-pointer flex-col items-center justify-center
          gap-sm rounded-normal border-4 border-dashed p-md text-center
          transition select-none"
        :class="
          isDragging
            ? 'border-accent bg-bg-accent text-accent'
            : 'border-border-1 hover:border-border-3 hover:bg-bg-2'
        "
        @click="fileInputRef?.click()"
        @dragover="onDragover"
        @dragleave="isDragging = false"
        @drop="onDrop"
      >
        <Icon
          name="upload"
          class="absolute top-1/2 left-1/2 size-[90%] -translate-x-1/2
            -translate-y-1/2 text-text-2/10"
        />
        <div class="relative text-shadow-bg-2 text-shadow-lg">
          <p class="text-shadow font-semibold">
            Drop or <span class="text-accent">Browse</span> file...
          </p>
          <div
            class="mt-xs flex flex-col items-center gap-sm text-sm text-text-2"
          >
            <p
              v-if="profileHint"
              class="text-center text-sm"
              v-html="profileHint"
            ></p>
            <div class="flex flex-col items-center gap-0.5">
              <span class="font-semibold">{{ phrase.file_formats }}</span>
              <span>
                <template v-if="profile.acceptedExtensions !== '*'">
                  {{ (profile.acceptedExtensions as string[]).join(' · ') }}
                </template>
                <template v-else>{{ phrase.file_any_format }}</template>
              </span>
            </div>
            <div class="flex flex-col items-center gap-0.5">
              <span class="font-semibold">{{ phrase.file_max_size }}</span>
              <span>
                {{ formatSize((profile as AssetUploadProfile).maxSizeBytes) }}
              </span>
            </div>
          </div>
        </div>
      </div>
      <input
        ref="fileInputRef"
        type="file"
        class="hidden"
        :accept="acceptAttr"
        @change="onFileInput"
      />
    </template>

    <!-- hashing / checking: indeterminate spinner -->
    <template v-else-if="state.type === 'hashing' || state.type === 'checking'">
      <div class="flex flex-col items-center gap-sm py-lg text-center">
        <Icon name="loading" class="animate-spin text-3xl text-accent" />
        <p class="text-sm text-text-2">
          {{
            state.type === 'hashing'
              ? 'Calculating file hash…'
              : 'Checking for duplicate…'
          }}
        </p>
      </div>
    </template>

    <!-- duplicate found -->
    <template v-else-if="state.type === 'duplicate'">
      <div class="flex flex-col items-center gap-sm py-lg text-center">
        <Icon name="check" class="text-3xl text-accent" />
        <p class="font-semibold">File already on server</p>
        <p class="text-sm text-text-2">Reusing the existing asset.</p>
      </div>
    </template>

    <!-- uploading: progress bar -->
    <template v-else-if="state.type === 'uploading'">
      <div class="flex flex-col gap-sm">
        <div class="flex items-center justify-between text-sm">
          <span class="truncate text-text-1">{{ state.filename }}</span>
          <span class="ml-sm shrink-0 text-text-2">{{
            formatSize(state.size)
          }}</span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-bg-3">
          <div
            class="h-full rounded-full bg-accent transition-[width]
              duration-200"
            :style="{ width: `${Math.round(state.progress * 100)}%` }"
          />
        </div>
        <p class="text-sm text-text-2">
          Uploading… {{ Math.round(state.progress * 100) }}%
        </p>
      </div>
    </template>

    <!-- processing: server-side sharp -->
    <template v-else-if="state.type === 'processing'">
      <div class="flex flex-col items-center gap-sm py-lg text-center">
        <Icon name="loading" class="animate-spin text-3xl text-accent" />
        <p class="text-sm text-text-2">Processing image…</p>
        <!-- indeterminate bar -->
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-bg-3">
          <div
            class="animate-indeterminate h-full w-1/3 rounded-full bg-accent"
          />
        </div>
      </div>
    </template>

    <!-- done: thumbnail + close -->
    <template v-else-if="state.type === 'done'">
      <div class="flex flex-col items-center gap-md py-md text-center">
        <img
          :src="`/api/admin/assets/preview/${state.result.link}.${state.result.extension}`"
          class="h-20 w-20 rounded-normal object-cover shadow-shadow-1"
          alt="Uploaded asset preview"
        />
        <p class="font-semibold text-text-1">Uploaded!</p>
        <Button @click="close">Close</Button>
      </div>
    </template>

    <!-- error -->
    <template v-else-if="state.type === 'error'">
      <div
        class="flex flex-col gap-xs rounded-normal border border-border-error
          bg-bg-error p-sm text-text-error"
      >
        <p class="font-semibold">Upload failed</p>
        <p class="text-sm">{{ state.message }}</p>
      </div>
      <div class="mt-sm flex justify-end">
        <Button variant="secondary" @click="retry">Try again</Button>
      </div>
    </template>
  </Modal>
</template>
