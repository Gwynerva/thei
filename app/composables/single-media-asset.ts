import type {
  AssetReplaceResult,
  AssetVariantInfo,
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

  /**
   * The slot's details, then the editor and back. The file the slot holds is
   * known by its uuid alone until the details window, open at once, has
   * fetched it; one just picked or made is known whole.
   */
  async function openDetails(initial: AssetVariantInfo | string) {
    let current: AssetReplaceResult | { assetUuid: string } =
      typeof initial === 'string'
        ? { assetUuid: initial }
        : mapAssetVariantToReplaceResult(initial);

    while (true) {
      const asideTitle = options.asideTitle();
      const result = await openModal(assetDetailsModal, {
        asideTitle,
        asset: current,
      });

      if (result.type === 'replace') {
        if (result.asset) current = result.asset;
        try {
          const replacement = await launchAssetEditor(current.assetUuid, {
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
          current = mapAssetVariantToReplaceResult(replacement);
        } catch (error) {
          reportError(error);
        }
        continue;
      }

      if (result.type === 'detach') await detach();
      return;
    }
  }

  // One flow: the details modal, the editor it hands off to, and the details
  // modal it comes back to replace one another, so the stack is momentarily
  // empty between them whenever this is opened from a page.
  function open() {
    return runModalFlow(runOpen);
  }

  async function runOpen() {
    const assetUuid = options.getAssetUuid();
    if (assetUuid) {
      try {
        await openDetails(assetUuid);
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
