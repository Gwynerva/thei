import type {
  AssetReplaceResult,
  AssetVariantInfo,
} from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import type { ExtensionProfile } from '#layers/thei/shared/assets/extensions';
import { anyFileExtensionProfile } from '#layers/thei/shared/assets/extensions';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import {
  ASSET_UPLOAD_LIMITS,
  type AssetUploadLimitPolicy,
} from '#layers/thei/shared/asset-upload-limits';
import { editFileModal } from '#layers/thei/app/modals/upload-settings/modal';
import { pickFileModal } from '#layers/thei/app/modals/pick-file/modal';
import type { PickedFile } from '#layers/thei/app/modals/pick-file/picked-file';
import type { PickedFiles } from '#layers/thei/app/modals/pick-file/picked-file';
import { createOriginalAssetSettings } from '#layers/thei/shared/asset-upload-settings';
import { runAssetBatch } from '#layers/thei/shared/asset-batch';

export type AssetWizardAccept =
  string | ExtensionProfile | (string | ExtensionProfile)[];

export interface AssetWizardOptions {
  accept?: AssetWizardAccept;
  maxSize?: number;
  acceptedExtensions?: string[] | '*';
  sizeLimitPolicy?: AssetUploadLimitPolicy;
  uploadProfile?: AssetUploadProfile;
  usageDelta?: Record<string, number>;
}

export interface AssetBatchError {
  fileName: string;
  message: string;
}

export interface AssetBatchResult {
  assets: AssetVariantInfo[];
  errors: AssetBatchError[];
}

export async function launchAssetWizard(
  options: AssetWizardOptions = {},
): Promise<AssetVariantInfo | undefined> {
  const accept = options.accept ?? anyFileExtensionProfile;
  const maxSize =
    options.maxSize ??
    (options.sizeLimitPolicy
      ? ASSET_UPLOAD_LIMITS[options.sizeLimitPolicy]
      : undefined);
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
          maxSize,
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
        source: {
          kind: 'file',
          file: pickedFile!,
          familyUuid: `af-${crypto.randomUUID()}`,
        },
        maxSize,
        acceptedExtensions,
        sizeLimitPolicy: options.sizeLimitPolicy,
        uploadProfile: options.uploadProfile,
      });

      if (editResult.type === 'error') {
        throw new Error(editResult.message);
      }

      if (editResult.type === 'upload-new' || editResult.type === 'empty') {
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

export async function launchAssetBatchWizard(
  options: AssetWizardOptions = {},
): Promise<AssetBatchResult | undefined> {
  const accept = options.accept ?? anyFileExtensionProfile;
  const maxSize =
    options.maxSize ??
    (options.sizeLimitPolicy
      ? ASSET_UPLOAD_LIMITS[options.sizeLimitPolicy]
      : undefined);
  const acceptedExtensions =
    options.acceptedExtensions ?? acceptedExtensionsFromAccept(accept);
  const result = await openModal(pickFileModal, {
    accept,
    maxSize,
    multiple: true,
  });
  if (result.type !== 'picked-files') return undefined;

  const picked = result as PickedFiles;
  const errors: AssetBatchError[] = [...picked.errors];
  const settled = await runAssetBatch(
    picked.files,
    async (file) => {
      try {
        return await uploadOriginalFile(file, {
          ...options,
          acceptedExtensions,
          maxSize,
        });
      } finally {
        URL.revokeObjectURL(file.objectUrl);
      }
    },
    3,
  );
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') return;
    const error = result.reason;
    errors.push({
      fileName: picked.files[index]!.name,
      message:
        error instanceof Error
          ? error.message
          : phrase.value.upload_error_apply,
    });
  });
  return {
    assets: settled.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value] : [],
    ),
    errors,
  };
}

async function uploadOriginalFile(
  file: PickedFile,
  options: AssetWizardOptions & {
    acceptedExtensions: string[] | '*';
    maxSize?: number;
  },
) {
  const formData = new FormData();
  formData.append('file', file.file, file.name);
  formData.append('familyUuid', `af-${crypto.randomUUID()}`);
  formData.append('settings', JSON.stringify(createOriginalAssetSettings()));
  if (options.maxSize !== undefined) {
    formData.append('maxSizeBytes', String(options.maxSize));
  }
  if (options.sizeLimitPolicy) {
    formData.append('sizeLimitPolicy', options.sizeLimitPolicy);
  }
  formData.append(
    'acceptedExtensions',
    options.acceptedExtensions === '*'
      ? '*'
      : JSON.stringify(options.acceptedExtensions),
  );
  return await $fetch<AssetVariantInfo>('/api/admin/assets', {
    method: 'POST',
    body: formData,
  });
}

export async function launchAssetEditor(
  asset: AssetVariantInfo,
  options: AssetWizardOptions = {},
): Promise<AssetVariantInfo | undefined> {
  while (true) {
    const editResult = await openModal(editFileModal, {
      source: { kind: 'asset', asset },
      maxSize: options.maxSize,
      acceptedExtensions:
        options.acceptedExtensions ??
        acceptedExtensionsFromAccept(options.accept ?? anyFileExtensionProfile),
      sizeLimitPolicy: options.sizeLimitPolicy,
      uploadProfile: options.uploadProfile,
      usageDelta: options.usageDelta,
    });

    if (editResult.type === 'error') {
      throw new Error(editResult.message);
    }
    if (editResult.type === 'upload-new') {
      const replacement = await launchAssetWizard({
        ...options,
      });
      if (replacement) {
        return replacement;
      }
      continue;
    }
    return editResult.type === 'asset-ready' ? editResult.asset : undefined;
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
    media:
      asset.type === AssetType.Image || asset.type === AssetType.Video
        ? asset.media
        : undefined,
    assetUrl: asset.assetUrl,
    meta: asset.meta,
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
