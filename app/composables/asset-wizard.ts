import type {
  AssetReplaceResult,
  AssetVariantInfo,
} from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import type { ExtensionProfile } from '#layers/thei/shared/assets/extensions';
import { anyFileExtensionProfile } from '#layers/thei/shared/assets/extensions';
import type { AssetUploadProfile } from '#layers/thei/shared/asset-upload-profiles';
import {
  resolveAssetMaxSize,
  type AssetUploadLimitPolicy,
} from '#layers/thei/shared/asset-upload-limits';
import { editFileModal } from '#layers/thei/app/modals/upload-settings/modal';
import { pickReuseFileModal } from '#layers/thei/app/modals/pick-file/modal';
import type { PickedFile } from '#layers/thei/app/modals/pick-file/picked-file';
import type { PickedFiles } from '#layers/thei/app/modals/pick-file/picked-file';
import { createOriginalAssetSettings } from '#layers/thei/shared/asset-upload-settings';
import { runAssetBatch } from '#layers/thei/shared/asset-batch';
import { assetLibraryModal } from '../modals/asset-library/modal';

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
  const maxSize = resolveAssetMaxSize(options.sizeLimitPolicy, options.maxSize);
  const acceptedExtensions =
    options.acceptedExtensions ?? acceptedExtensionsFromAccept(accept);

  let step: 'pick' | 'edit' = 'pick';
  let pickedFile: PickedFile | undefined;
  let notice: string | undefined;

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

        const pickResult = await openModal(pickReuseFileModal, {
          accept,
          maxSize,
          notice,
          acceptedExtensions,
          sizeLimitPolicy: options.sizeLimitPolicy,
        });
        notice = undefined;

        if (pickResult.type === 'error') {
          throw new Error(pickResult.message);
        }

        if (pickResult.type === 'library') {
          const result = await openModal(assetLibraryModal, {
            ...options,
            maxSize,
            acceptedExtensions,
          });
          if (result.type === 'assets-ready') return result.assets[0];
          continue;
        }

        if (pickResult.type !== 'picked-file') {
          return undefined;
        }

        pickedFile = pickResult;
        step = 'edit';
        continue;
      }

      const editResult = await openModal(editFileModal, {
        source: pickedFile!.existingAsset
          ? { kind: 'asset', asset: pickedFile!.existingAsset }
          : {
              kind: 'file',
              file: pickedFile!,
            },
        maxSize,
        acceptedExtensions,
        sizeLimitPolicy: options.sizeLimitPolicy,
        uploadProfile: options.uploadProfile,
        usageDelta: options.usageDelta,
        duplicateNotice: Boolean(pickedFile!.existingAsset),
      });

      if (editResult.type === 'error') {
        throw new Error(editResult.message);
      }

      if (editResult.type === 'asset-missing')
        notice = phrase.value.asset_library_missing;
      if (
        editResult.type === 'upload-new' ||
        editResult.type === 'empty' ||
        editResult.type === 'asset-missing'
      ) {
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
  const maxSize = resolveAssetMaxSize(options.sizeLimitPolicy, options.maxSize);
  const acceptedExtensions =
    options.acceptedExtensions ?? acceptedExtensionsFromAccept(accept);
  const result = await openModal(pickReuseFileModal, {
    accept,
    maxSize,
    multiple: true,
    acceptedExtensions,
    sizeLimitPolicy: options.sizeLimitPolicy,
  });
  if (result.type === 'library') {
    const selected = await openModal(assetLibraryModal, {
      ...options,
      maxSize,
      acceptedExtensions,
      multiple: true,
    });
    return selected.type === 'assets-ready'
      ? { assets: selected.assets, errors: [] }
      : undefined;
  }
  if (result.type !== 'picked-files') return undefined;

  const picked = result as PickedFiles;
  const errors: AssetBatchError[] = [...picked.errors];
  const resolved = new Map<PickedFile, AssetVariantInfo | undefined>();
  for (const file of picked.files.filter((file) => file.existingAsset)) {
    try {
      const selected = await openModal(editFileModal, {
        source: { kind: 'asset', asset: file.existingAsset! },
        maxSize,
        acceptedExtensions,
        sizeLimitPolicy: options.sizeLimitPolicy,
        uploadProfile: options.uploadProfile,
        usageDelta: options.usageDelta,
        duplicateNotice: true,
        librarySelection: true,
      });
      resolved.set(
        file,
        selected.type === 'asset-ready' ? selected.asset : undefined,
      );
    } catch (error) {
      errors.push({
        fileName: file.name,
        message:
          error instanceof Error
            ? error.message
            : phrase.value.upload_error_apply,
      });
      resolved.set(file, undefined);
    } finally {
      URL.revokeObjectURL(file.objectUrl);
    }
  }
  const newFiles = picked.files.filter((file) => !file.existingAsset);
  const settled = await runAssetBatch(
    newFiles,
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
    if (result.status === 'fulfilled') {
      resolved.set(newFiles[index]!, result.value);
      return;
    }
    const error = result.reason;
    errors.push({
      fileName: newFiles[index]!.name,
      message:
        error instanceof Error
          ? error.message
          : phrase.value.upload_error_apply,
    });
  });
  return {
    assets: [
      ...new Map(
        picked.files.flatMap((file) => {
          const asset = resolved.get(file);
          return asset ? [[asset.assetUuid, asset] as const] : [];
        }),
      ).values(),
    ],
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
    if (
      editResult.type === 'upload-new' ||
      editResult.type === 'asset-missing'
    ) {
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
