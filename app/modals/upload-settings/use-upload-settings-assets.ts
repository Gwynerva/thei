import type {
  AssetUploadResponse,
  AssetVariantInfo,
  AssetVariantWithUsage,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
import type { AssetDraftSource } from '#layers/thei/shared/api/asset-draft';
import type { AssetUploadProgress } from '#layers/thei/shared/api/asset-upload-progress';
import type { AssetUploadRequest } from '#layers/thei/shared/asset-upload-settings';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import type { AssetUploadLimitPolicy } from '#layers/thei/shared/asset-upload-limits';
import { commitDraftRequest } from '#layers/thei/app/composables/upload-draft';
import type { PickedFile } from '../pick-file/picked-file';

export interface UploadSettingsModalData {
  duplicateNotice?: boolean;
  librarySelection?: boolean;
  source:
    | { kind: 'file'; file: PickedFile }
    | { kind: 'asset'; asset: AssetVariantInfo }
    /** A file someone else staged — a block storing a paste — and the file. */
    | { kind: 'draft'; draft: AssetDraftSource; file: PickedFile };
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
  /** Where the commit under way is; nothing while none is. */
  const status = ref<AssetUploadProgress | null>(null);
  let commitController: AbortController | null = null;

  onBeforeUnmount(() => commitController?.abort());

  async function loadVariants(): Promise<AssetVariantWithUsage[]> {
    if (modalData.source.kind !== 'asset') return variants.value;
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
   * with progress for the slow cases. A second commit replaces the first.
   */
  async function commit(
    draft: AssetDraftSource,
    settings: AssetUploadRequest,
  ): Promise<AssetUploadResponse> {
    commitController?.abort();
    const controller = new AbortController();
    commitController = controller;
    status.value = { phase: 'processing' };
    try {
      const result = await commitDraftRequest(
        draft.draftId,
        settings,
        modalData,
        {
          signal: controller.signal,
          onStatus: (progress) => {
            if (commitController === controller) status.value = progress;
          },
        },
      );
      remember(result);
      return result;
    } finally {
      if (commitController === controller) {
        commitController = null;
        status.value = null;
      }
    }
  }

  /** Gives the commit under way up: a queued job leaves, an encode stops. */
  function cancelCommit() {
    commitController?.abort();
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

  return {
    variants,
    loadingVariants,
    status,
    loadVariants,
    commit,
    cancelCommit,
    touch,
  };
}
