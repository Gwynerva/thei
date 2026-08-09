import type {
  AssetVariantInfo,
  AssetVariantsResponse,
} from '#layers/thei/shared/api/asset';
import {
  imageExtensionProfile,
  videoExtensionProfile,
} from '#layers/thei/shared/assets/extensions';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import { ASSET_UPLOAD_LIMITS } from '#layers/thei/shared/asset-upload-limits';
import { assetDetailsModal } from '#layers/thei/app/modals/asset-details/modal';
import {
  launchAssetEditor,
  launchAssetWizard,
  mapAssetVariantToReplaceResult,
} from '#layers/thei/app/composables/asset-wizard';
import type { AssetWizardAccept } from '#layers/thei/app/composables/asset-wizard';
import {
  applySingleMediaAsset,
  detachSingleMediaAsset,
  type SingleMediaAssetState,
} from '#layers/thei/app/composables/single-media-asset-state';

export interface SingleMediaAssetOptions extends SingleMediaAssetState {
  uploadProfile: AssetUploadProfile;
  asideTitle: () => string;
  getAssetUuid: () => string | undefined;
  usageDelta?: () => Record<string, number>;
  onError?: (error: unknown) => void;
  accept?: AssetWizardAccept;
}

export function useSingleMediaAsset(options: SingleMediaAssetOptions) {
  function reportError(error: unknown) {
    if (options.onError) options.onError(error);
    else console.error(error);
  }

  function apply(asset: AssetVariantInfo) {
    return applySingleMediaAsset(options, asset);
  }

  async function detach() {
    await detachSingleMediaAsset(options);
  }

  async function loadAsset(assetUuid: string) {
    const family = await $fetch<AssetVariantsResponse>(
      '/api/admin/assets/variants',
      {
        method: 'POST',
        body: { assetUuid },
      },
    );
    return family.variants.find((variant) => variant.assetUuid === assetUuid);
  }

  async function openDetails(initialAsset: AssetVariantInfo) {
    let current = initialAsset;

    while (true) {
      const asideTitle = options.asideTitle();
      const result = await openModal(assetDetailsModal, {
        asideTitle,
        asset: mapAssetVariantToReplaceResult(current),
      });

      if (result.type === 'replace') {
        try {
          const replacement = await launchAssetEditor(current, {
            accept: options.accept ?? [
              imageExtensionProfile,
              videoExtensionProfile,
            ],
            maxSize: ASSET_UPLOAD_LIMITS.media,
            sizeLimitPolicy: 'media',
            uploadProfile: options.uploadProfile,
            usageDelta: options.usageDelta?.(),
          });
          if (!replacement) continue;
          if (!apply(replacement)) continue;
          current = replacement;
        } catch (error) {
          reportError(error);
        }
        continue;
      }

      if (result.type === 'detach') await detach();
      return;
    }
  }

  async function open() {
    const assetUuid = options.getAssetUuid();
    if (assetUuid) {
      try {
        const asset = await loadAsset(assetUuid);
        if (asset) await openDetails(asset);
      } catch (error) {
        reportError(error);
      }
      return;
    }

    try {
      const asset = await launchAssetWizard({
        accept: options.accept ?? [
          imageExtensionProfile,
          videoExtensionProfile,
        ],
        maxSize: ASSET_UPLOAD_LIMITS.media,
        sizeLimitPolicy: 'media',
        uploadProfile: options.uploadProfile,
      });
      if (!asset || !apply(asset)) return;
      await openDetails(asset);
    } catch (error) {
      reportError(error);
    }
  }

  return { open, apply, detach };
}
