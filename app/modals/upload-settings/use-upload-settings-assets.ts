import type {
  AssetUploadResponse,
  AssetVariantInfo,
  AssetVariantWithUsage,
  AssetWizardResult,
} from '#layers/thei/shared/api/asset';
import type { AssetDraftSource } from '#layers/thei/shared/api/asset-draft';
import type { AssetUploadProgress } from '#layers/thei/shared/api/asset-upload-progress';
import type { AssetUploadRequest } from '#layers/thei/shared/asset-upload-settings';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import type { AssetUploadLimitPolicy } from '#layers/thei/shared/asset-upload-limits';
import { commitDraftRequest } from '#layers/thei/app/composables/upload-draft';
import type { PickedFile } from '../pick-file/picked-file';

interface EditFileOptions {
  duplicateNotice?: boolean;
  librarySelection?: boolean;
  maxSize?: number;
  acceptedExtensions?: string[] | '*';
  sizeLimitPolicy?: AssetUploadLimitPolicy;
  uploadProfile?: AssetUploadProfile;
  usageDelta?: Record<string, number>;
}

/** What the file editor is opened with. */
export interface EditFileModalData extends EditFileOptions {
  source:
    | { kind: 'file'; file: PickedFile }
    /** A stored file: the editor fetches it, with its family, itself. */
    | { kind: 'asset'; assetUuid: string }
    /** A file someone else staged — a block storing a paste — and the file. */
    | { kind: 'draft'; draft: AssetDraftSource; file: PickedFile };
}

/** What the editor's panel is drawn with: a stored file comes with its family. */
export interface UploadSettingsModalData extends EditFileOptions {
  source:
    | { kind: 'file'; file: PickedFile }
    | {
        kind: 'asset';
        asset: AssetVariantInfo;
        /** Every stored variant of the file, itself included. */
        variants: AssetVariantWithUsage[];
      }
    | { kind: 'draft'; draft: AssetDraftSource; file: PickedFile };
}

export type UploadSettingsResult =
  { type: 'upload-new' } | { type: 'asset-missing' } | AssetWizardResult;

/**
 * The stored variants of the file being edited, and the requests that add to
 * them or pick one of them.
 */
export function useUploadSettingsAssets(modalData: UploadSettingsModalData) {
  // Counted as they will be once the text being edited is saved.
  const variants = ref<AssetVariantWithUsage[]>(
    modalData.source.kind === 'asset'
      ? modalData.source.variants.map((variant) => ({
          ...variant,
          usageCount: Math.max(
            0,
            variant.usageCount +
              (modalData.usageDelta?.[variant.assetUuid] ?? 0),
          ),
        }))
      : [],
  );
  /** Where the commit under way is; nothing while none is. */
  const status = ref<AssetUploadProgress | null>(null);
  let commitController: AbortController | null = null;

  onBeforeUnmount(() => commitController?.abort());

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
    status,
    commit,
    cancelCommit,
    touch,
  };
}
