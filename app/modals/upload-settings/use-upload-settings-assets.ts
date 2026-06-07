import type {
  AssetUploadResponse,
  AssetVariantInfo,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
import type { AssetUploadSettings } from '#layers/thei/shared/asset-upload-settings';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import type { PickedFile } from '../pick-file/picked-file';

export type UploadSettingsBusyAction = 'variants' | 'upload-original' | 'apply';
export type UploadSettingsStatus =
  | { phase: 'uploading'; progress?: number }
  | { phase: 'processing'; progress?: number };

export interface UploadSettingsModalData {
  file: PickedFile;
  maxSize?: number;
  acceptedExtensions?: string[] | '*';
  uploadProfile?: AssetUploadProfile;
}

export function useUploadSettingsAssets(modalData: UploadSettingsModalData) {
  const busyAction = ref<UploadSettingsBusyAction>();
  const uploadStatus = ref<UploadSettingsStatus | null>(null);
  const activeXhr = shallowRef<XMLHttpRequest | null>(null);
  const variants = ref<AssetVariantInfo[]>([]);
  const temporaryAssetUuid = ref<string | null>(null);
  let progressPollTimer: ReturnType<typeof setInterval> | undefined;

  onBeforeUnmount(() => {
    activeXhr.value?.abort();
    stopProgressPolling();
    activeXhr.value = null;
  });

  async function loadVariants(): Promise<AssetVariantInfo[]> {
    busyAction.value = 'variants';
    try {
      const response = await $fetch<AssetVariantsResponse>(
        '/api/admin/assets/variants',
        {
          method: 'POST',
          body: { rawHash: modalData.file.rawHash },
        },
      );
      variants.value = response.variants;
      return response.variants;
    } finally {
      busyAction.value = undefined;
    }
  }

  async function uploadWithSettings(
    settings: AssetUploadSettings,
    options: { previousAssetUuid?: string | null } = {},
  ): Promise<AssetUploadResponse> {
    const formData = new FormData();
    formData.append('file', modalData.file.file, modalData.file.name);
    formData.append('rawHash', modalData.file.rawHash);
    formData.append('settings', JSON.stringify(settings));
    const uploadId = crypto.randomUUID();
    formData.append('uploadId', uploadId);

    if (modalData.maxSize !== undefined) {
      formData.append('maxSizeBytes', String(modalData.maxSize));
    }

    if (modalData.acceptedExtensions) {
      formData.append(
        'acceptedExtensions',
        modalData.acceptedExtensions === '*'
          ? '*'
          : JSON.stringify(modalData.acceptedExtensions),
      );
    }

    if (options.previousAssetUuid) {
      formData.append('previousAssetUuid', options.previousAssetUuid);
    }

    return await new Promise<AssetUploadResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeXhr.value = xhr;
      uploadStatus.value = { phase: 'uploading' };
      xhr.open('POST', '/api/admin/assets/upload');

      xhr.upload.addEventListener('progress', (event) => {
        uploadStatus.value = {
          phase: 'uploading',
          progress: event.lengthComputable
            ? Math.max(0, Math.min(1, event.loaded / event.total))
            : undefined,
        };
      });

      xhr.upload.addEventListener('load', () => {
        uploadStatus.value = { phase: 'processing' };
        startProgressPolling(uploadId);
      });

      xhr.addEventListener('load', () => {
        activeXhr.value = null;
        stopProgressPolling();
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText) as AssetUploadResponse);
          } catch {
            reject(new Error(phrase.value.upload_error_invalid_response));
          }
          return;
        }

        reject(new Error(readXhrErrorMessage(xhr)));
      });

      xhr.addEventListener('error', () => {
        activeXhr.value = null;
        stopProgressPolling();
        reject(new Error(phrase.value.upload_error_network));
      });

      xhr.addEventListener('abort', () => {
        activeXhr.value = null;
        stopProgressPolling();
        reject(new Error(phrase.value.upload_error_cancelled));
      });

      xhr.send(formData);
    });
  }

  async function discardTemporaryExcept(
    assetUuidToKeep: string,
  ): Promise<string | undefined> {
    const assetUuid = temporaryAssetUuid.value;
    if (!assetUuid || assetUuid === assetUuidToKeep) return undefined;

    await $fetch('/api/admin/assets/discard', {
      method: 'POST',
      body: { assetUuid },
    }).catch(() => {});
    variants.value = variants.value.filter(
      (variant) => variant.assetUuid !== assetUuid,
    );
    temporaryAssetUuid.value = null;
    return assetUuid;
  }

  function startProgressPolling(uploadId: string) {
    stopProgressPolling();
    progressPollTimer = setInterval(async () => {
      try {
        const progress = await $fetch<UploadSettingsStatus | null>(
          `/api/admin/assets/upload-progress/${uploadId}`,
        );
        if (progress) uploadStatus.value = progress;
      } catch {
        // Upload errors are handled by the main request.
      }
    }, 500);
  }

  function stopProgressPolling() {
    if (!progressPollTimer) return;
    clearInterval(progressPollTimer);
    progressPollTimer = undefined;
  }

  function readXhrErrorMessage(xhr: XMLHttpRequest): string {
    try {
      const response = JSON.parse(xhr.responseText) as { message?: string };
      return (
        response.message ?? phrase.value.upload_error_request_failed(xhr.status)
      );
    } catch {
      return phrase.value.upload_error_request_failed(xhr.status);
    }
  }

  return {
    busyAction,
    uploadStatus,
    variants,
    temporaryAssetUuid,
    loadVariants,
    uploadWithSettings,
    discardTemporaryExcept,
  };
}
