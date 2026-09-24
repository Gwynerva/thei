import type {
  AssetUploadResponse,
  AssetVariantInfo,
  AssetVariantWithUsage,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
import type { AssetDraftSource } from '#layers/thei/shared/api/asset-draft';
import type { AssetUploadRequest } from '#layers/thei/shared/asset-upload-settings';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import type { AssetUploadLimitPolicy } from '#layers/thei/shared/asset-upload-limits';
import type { PickedFile } from '../pick-file/picked-file';

export type UploadSettingsStatus =
  | { phase: 'uploading'; progress?: number }
  /** Waiting for a processing slot, so the user is not left staring at 0%. */
  | { phase: 'queued'; progress?: number }
  | { phase: 'processing'; progress?: number };

export interface UploadSettingsModalData {
  duplicateNotice?: boolean;
  librarySelection?: boolean;
  source:
    | { kind: 'file'; file: PickedFile }
    | { kind: 'asset'; asset: AssetVariantInfo };
  maxSize?: number;
  acceptedExtensions?: string[] | '*';
  sizeLimitPolicy?: AssetUploadLimitPolicy;
  uploadProfile?: AssetUploadProfile;
  usageDelta?: Record<string, number>;
}

/**
 * The stored variants of the file being edited, and the requests that add to
 * them or pick one of them.
 */
export function useUploadSettingsAssets(modalData: UploadSettingsModalData) {
  const variants = ref<AssetVariantWithUsage[]>([]);
  const loadingVariants = ref(false);
  const status = ref<UploadSettingsStatus | null>(null);
  let progressTimer: ReturnType<typeof setInterval> | undefined;
  let commitController: AbortController | null = null;

  onBeforeUnmount(() => {
    commitController?.abort();
    stopProgressPolling();
  });

  async function loadVariants(): Promise<AssetVariantWithUsage[]> {
    if (modalData.source.kind === 'file') return variants.value;
    loadingVariants.value = true;
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
      loadingVariants.value = false;
    }
  }

  /**
   * Stores a result made from the draft. An image already rendered with
   * these settings is stored as it was shown; anything else is made now,
   * with progress for the slow cases.
   */
  async function commit(
    draft: AssetDraftSource,
    settings: AssetUploadRequest,
  ): Promise<AssetUploadResponse> {
    commitController?.abort();
    const controller = new AbortController();
    commitController = controller;
    const uploadId = crypto.randomUUID();
    status.value = { phase: 'processing' };
    startProgressPolling(uploadId);
    try {
      const result = await $fetch<AssetUploadResponse>(
        `/api/admin/assets/drafts/${draft.draftId}/commit`,
        {
          method: 'POST',
          signal: controller.signal,
          body: {
            settings,
            uploadId,
            maxSize: modalData.maxSize,
            acceptedExtensions: modalData.acceptedExtensions,
            sizeLimitPolicy: modalData.sizeLimitPolicy,
          },
        },
      );
      remember(result);
      return result;
    } finally {
      stopProgressPolling();
      status.value = null;
      if (commitController === controller) commitController = null;
    }
  }

  function remember(asset: AssetVariantInfo) {
    const index = variants.value.findIndex(
      (variant) => variant.assetUuid === asset.assetUuid,
    );
    const item: AssetVariantWithUsage = {
      ...asset,
      usageCount: index >= 0 ? variants.value[index]!.usageCount : 0,
    };
    if (index >= 0) variants.value.splice(index, 1, item);
    else variants.value.unshift(item);
  }

  /** Confirms a stored variant is still there and fits the field. */
  async function touch(assetUuid: string) {
    await $fetch(`/api/admin/assets/${assetUuid}/touches`, {
      method: 'POST',
      body: {
        acceptedExtensions: modalData.acceptedExtensions,
        maxSize: modalData.maxSize,
        sizeLimitPolicy: modalData.sizeLimitPolicy,
      },
    });
  }

  function startProgressPolling(uploadId: string) {
    stopProgressPolling();
    progressTimer = setInterval(async () => {
      try {
        const progress = await $fetch<UploadSettingsStatus | null>(
          `/api/admin/uploads/${uploadId}`,
        );
        if (progress && status.value) status.value = progress;
      } catch {
        // Errors surface through the request itself.
      }
    }, 500);
  }

  function stopProgressPolling() {
    if (!progressTimer) return;
    clearInterval(progressTimer);
    progressTimer = undefined;
  }

  return {
    variants,
    loadingVariants,
    status,
    loadVariants,
    commit,
    touch,
  };
}
