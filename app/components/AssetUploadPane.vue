<script lang="ts" setup>
import type {
  AssetCheckRequest,
  AssetCheckResponse,
  AssetUploadResponse,
} from '#layers/thei/shared/api/asset';
import { ASSET_PROFILES } from '#layers/thei/shared/asset-profiles';
import type { AssetProfileId } from '#layers/thei/shared/asset-profiles';

type UploadState =
  | { type: 'hashing' }
  | { type: 'checking' }
  | { type: 'uploading'; filename: string; size: number; progress: number }
  | { type: 'processing' }
  | { type: 'error'; message: string };

const props = defineProps<{ profileId: AssetProfileId; initialFile: File }>();
const modal = useModal();
const profile = computed(() => ASSET_PROFILES[props.profileId]);
const activeXhr = ref<XMLHttpRequest>();
const state = ref<UploadState>({ type: 'hashing' });
const currentFile = shallowRef<File>(props.initialFile);

function retry() {
  handleFile(currentFile.value);
}

onMounted(() => {
  handleFile(props.initialFile);
});

onBeforeUnmount(() => {
  if (state.value.type === 'uploading' || state.value.type === 'processing') {
    activeXhr.value?.abort();
    activeXhr.value = undefined;
  }
});

const formatSize = useHumanSize();

async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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
    modal.pop(checkResult);
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
          modal.pop(result);
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
</script>

<template>
  <!-- hashing / checking: indeterminate spinner -->
  <template v-if="state.type === 'hashing' || state.type === 'checking'">
    <div class="flex flex-col items-center gap-sm py-lg text-center">
      <Icon name="loading" class="text-3xl text-accent" />
      <p class="text-sm text-text-2">
        {{
          state.type === 'hashing'
            ? phrase.asset_upload_hashing
            : phrase.asset_upload_checking
        }}
      </p>
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
          class="h-full rounded-full bg-accent transition-[width] duration-200"
          :style="{ width: `${Math.round(state.progress * 100)}%` }"
        />
      </div>
      <p class="text-sm text-text-2">
        {{ phrase.asset_upload_uploading(Math.round(state.progress * 100)) }}
      </p>
    </div>
  </template>

  <!-- processing: server-side -->
  <template v-else-if="state.type === 'processing'">
    <div class="flex flex-col items-center gap-sm py-lg text-center">
      <Icon name="loading" class="text-3xl text-accent" />
      <p class="text-sm text-text-2">{{ phrase.asset_upload_processing }}</p>
    </div>
  </template>

  <!-- error -->
  <template v-else-if="state.type === 'error'">
    <div
      class="flex flex-col gap-xs rounded-normal border border-border-error
        bg-bg-error p-sm text-text-error"
    >
      <p class="font-semibold">{{ phrase.asset_upload_failed }}</p>
      <p class="text-sm">{{ state.message }}</p>
    </div>
    <div class="mt-sm flex justify-end">
      <Button variant="secondary" @click="retry">{{
        phrase.asset_upload_retry
      }}</Button>
    </div>
  </template>
</template>
