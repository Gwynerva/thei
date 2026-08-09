import type {
  AssetUploadResponse,
  AssetVariantInfo,
  AssetVariantWithUsage,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
import type { AssetUploadSettings } from '#layers/thei/shared/asset-upload-settings';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import type { AssetUploadLimitPolicy } from '#layers/thei/shared/asset-upload-limits';
import type { PickedFile } from '../pick-file/picked-file';

export type UploadSettingsBusyAction = 'variants' | 'save-unchanged' | 'apply';
export type UploadSettingsStatus =
  | { phase: 'uploading'; progress?: number }
  | { phase: 'processing'; progress?: number };

export interface UploadSettingsModalData {
  source:
    | { kind: 'file'; file: PickedFile; familyUuid: string }
    | { kind: 'asset'; asset: AssetVariantInfo };
  maxSize?: number;
  acceptedExtensions?: string[] | '*';
  sizeLimitPolicy?: AssetUploadLimitPolicy;
  uploadProfile?: AssetUploadProfile;
  usageDelta?: Record<string, number>;
}

export function useUploadSettingsAssets(modalData: UploadSettingsModalData) {
  const busyAction = ref<UploadSettingsBusyAction>();
  const uploadStatus = ref<UploadSettingsStatus | null>(null);
  const activeXhr = shallowRef<XMLHttpRequest | null>(null);
  const variants = ref<AssetVariantWithUsage[]>([]);
  let progressPollTimer: ReturnType<typeof setInterval> | undefined;

  onBeforeUnmount(() => {
    activeXhr.value?.abort();
    stopProgressPolling();
    activeXhr.value = null;
  });

  async function loadVariants(): Promise<AssetVariantWithUsage[]> {
    if (modalData.source.kind === 'file') return variants.value;
    busyAction.value = 'variants';
    try {
      const response = await $fetch<AssetVariantsResponse>(
        `/api/admin/assets/${modalData.source.asset.assetUuid}/variants`,
      );
      variants.value = response.variants.map((variant) => ({
        ...variant,
        usageCount: Math.max(
          0,
          variant.usageCount + (modalData.usageDelta?.[variant.assetUuid] ?? 0),
        ),
      }));
      return variants.value;
    } finally {
      busyAction.value = undefined;
    }
  }

  async function uploadWithSettings(
    settings: AssetUploadSettings,
    sourceAssetUuid?: string,
  ): Promise<AssetUploadResponse> {
    if (sourceAssetUuid || modalData.source.kind === 'asset') {
      return await transformStoredAsset(settings, sourceAssetUuid);
    }

    const formData = new FormData();
    formData.append(
      'file',
      modalData.source.file.file,
      modalData.source.file.name,
    );
    formData.append('familyUuid', modalData.source.familyUuid);
    formData.append('settings', JSON.stringify(settings));
    const uploadId = crypto.randomUUID();
    formData.append('uploadId', uploadId);

    if (modalData.maxSize !== undefined) {
      formData.append('maxSizeBytes', String(modalData.maxSize));
    }

    if (modalData.sizeLimitPolicy) {
      formData.append('sizeLimitPolicy', modalData.sizeLimitPolicy);
    }

    if (modalData.acceptedExtensions) {
      formData.append(
        'acceptedExtensions',
        modalData.acceptedExtensions === '*'
          ? '*'
          : JSON.stringify(modalData.acceptedExtensions),
      );
    }

    const result = await new Promise<AssetUploadResponse>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeXhr.value = xhr;
      uploadStatus.value = { phase: 'uploading' };
      xhr.open('POST', '/api/admin/assets');

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
    rememberVariant(result);
    return result;
  }

  async function transformStoredAsset(
    settings: AssetUploadSettings,
    sourceAssetUuid?: string,
  ): Promise<AssetUploadResponse> {
    const uploadId = crypto.randomUUID();
    uploadStatus.value = { phase: 'processing' };
    startProgressPolling(uploadId);
    try {
      const assetUuid =
        sourceAssetUuid ??
        (modalData.source.kind === 'asset'
          ? modalData.source.asset.assetUuid
          : '');
      const result = await $fetch<AssetUploadResponse>(
        `/api/admin/assets/${assetUuid}/variants`,
        {
          method: 'POST',
          body: {
            settings,
            uploadId,
          },
        },
      );
      rememberVariant(result);
      return result;
    } finally {
      stopProgressPolling();
    }
  }

  function rememberVariant(asset: AssetVariantInfo) {
    const existingIndex = variants.value.findIndex(
      (variant) => variant.assetUuid === asset.assetUuid,
    );
    const item: AssetVariantWithUsage = {
      ...asset,
      usageCount:
        existingIndex >= 0 ? variants.value[existingIndex]!.usageCount : 0,
    };
    if (existingIndex >= 0) {
      variants.value.splice(existingIndex, 1, item);
    } else {
      variants.value.unshift(item);
    }
  }

  async function touchVariant(assetUuid: string) {
    await $fetch(`/api/admin/assets/${assetUuid}/touches`, {
      method: 'POST',
    });
  }

  function startProgressPolling(uploadId: string) {
    stopProgressPolling();
    progressPollTimer = setInterval(async () => {
      try {
        const progress = await $fetch<UploadSettingsStatus | null>(
          `/api/admin/uploads/${uploadId}`,
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
    loadVariants,
    uploadWithSettings,
    touchVariant,
  };
}
