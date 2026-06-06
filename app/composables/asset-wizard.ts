import type {
  AssetReplaceResult,
  AssetVariantInfo,
} from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import type { ExtensionProfile } from '#layers/thei/shared/assets/extensions';
import { anyFileExtensionProfile } from '#layers/thei/shared/assets/extensions';
import { editFileModal } from '#layers/thei/app/modals/upload-settings/modal';
import { pickFileModal } from '#layers/thei/app/modals/pick-file/modal';
import type { PickedFile } from '#layers/thei/app/modals/pick-file/picked-file';

export type AssetWizardAccept =
  | string
  | ExtensionProfile
  | (string | ExtensionProfile)[];

export interface AssetWizardOptions {
  accept?: AssetWizardAccept;
  maxSize?: number;
  acceptedExtensions?: string[] | '*';
}

export async function launchAssetWizard(
  options: AssetWizardOptions = {},
): Promise<AssetVariantInfo | undefined> {
  const accept = options.accept ?? anyFileExtensionProfile;
  const acceptedExtensions =
    options.acceptedExtensions ?? acceptedExtensionsFromAccept(accept);

  let step: 'pick' | 'edit' = 'pick';
  let pickedFile: PickedFile | undefined;

  function cleanupPickedFile() {
    if (!pickedFile) return;
    URL.revokeObjectURL(pickedFile.objectUrl);
    pickedFile = undefined;
  }

  try {
    while (true) {
      if (step === 'pick') {
        cleanupPickedFile();
        editFileModal.component();

        const pickResult = await openModal(pickFileModal, {
          accept,
          maxSize: options.maxSize,
        });

        if (pickResult.type === 'error') {
          throw new Error(pickResult.message);
        }

        if (pickResult.type !== 'picked-file') {
          return undefined;
        }

        pickedFile = pickResult;
        step = 'edit';
        continue;
      }

      const editResult = await openModal(editFileModal, {
        file: pickedFile!,
        maxSize: options.maxSize,
        acceptedExtensions,
      });

      if (editResult.type === 'error') {
        throw new Error(editResult.message);
      }

      if (editResult.type === 'upload-new') {
        step = 'pick';
        continue;
      }

      if (editResult.type === 'asset-ready') {
        return editResult.asset;
      }

      return undefined;
    }
  } finally {
    cleanupPickedFile();
  }
}

export function mapAssetVariantToReplaceResult(
  asset: AssetVariantInfo,
): AssetReplaceResult {
  return {
    assetUuid: asset.assetUuid,
    slug: asset.slug,
    extension: asset.extension,
    size: asset.size,
    previewUrl:
      asset.type === AssetType.Image || asset.type === AssetType.Video
        ? asset.previewUrl
        : undefined,
    videoUrl: asset.type === AssetType.Video ? asset.videoUrl : undefined,
    assetUrl: asset.assetUrl,
  };
}

export function acceptedExtensionsFromAccept(
  accept: AssetWizardAccept,
): string[] | '*' {
  const items = Array.isArray(accept) ? accept : [accept];
  const extensions = new Set<string>();

  for (const item of items) {
    if (typeof item === 'string') {
      extensions.add(normalizeExtension(item));
      continue;
    }

    if (item.extensions === '*') {
      return '*';
    }

    for (const extension of item.extensions) {
      extensions.add(normalizeExtension(extension));
    }
  }

  return Array.from(extensions).filter(Boolean);
}

function normalizeExtension(extension: string): string {
  return extension.trim().replace(/^\./, '').toLowerCase();
}
