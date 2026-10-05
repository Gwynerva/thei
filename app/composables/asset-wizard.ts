import type {
  AssetReplaceResult,
  AssetVariantInfo,
} from '#layers/thei/shared/api/asset';
import { AssetType } from '#layers/thei/shared/asset';
import { audioDescriptorFromMeta } from '#layers/thei/shared/audio';
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
import { runAssetBatch } from '#layers/thei/shared/asset-batch';
import type { ContentAssetData } from '#layers/thei/shared/content';
import {
  PendingOriginalUpload,
  type PendingMediaHandover,
  type PendingUpload,
} from './pending-upload';
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

/**
 * What a batch pick gives back the moment the files are known: the assets
 * already in the library — picked there, or duplicates settled through the
 * editor — and the new files, still on their way. Those are running; whoever
 * placed them shows a tile for each and takes its `result` when it lands.
 */
export interface AssetBatchResult {
  assets: AssetVariantInfo[];
  uploads: PendingUpload[];
  errors: AssetBatchError[];
}

/**
 * Every wizard runs inside `runModalFlow`.
 *
 * A wizard settles one modal before it opens the next, so the stack drops by
 * one between steps — to zero when the wizard was launched from a page rather
 * than from another modal. The flow marker tells the history interceptor that
 * the layer is still occupied, so it does not hand the sentinel entry back and
 * race the next step.
 */
export function launchAssetWizard(
  options: AssetWizardOptions = {},
): Promise<AssetVariantInfo | undefined> {
  return runModalFlow(() => runAssetWizard(options));
}

async function runAssetWizard(
  options: AssetWizardOptions,
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
        // Both possible next steps are preloaded, so replacing this modal costs
        // a microtask instead of a chunk fetch.
        editFileModal.component();
        assetLibraryModal.component();

        const pickResult = await openModal(pickReuseFileModal, {
          accept,
          maxSize,
          notice,
          acceptedExtensions,
          sizeLimitPolicy: options.sizeLimitPolicy,
          uploadProfile: options.uploadProfile,
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

export function launchAssetBatchWizard(
  options: AssetWizardOptions = {},
): Promise<AssetBatchResult | undefined> {
  return runModalFlow(() => runAssetBatchWizard(options));
}

async function runAssetBatchWizard(
  options: AssetWizardOptions,
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
    uploadProfile: options.uploadProfile,
  });
  if (result.type === 'library') {
    const selected = await openModal(assetLibraryModal, {
      ...options,
      maxSize,
      acceptedExtensions,
      multiple: true,
    });
    return selected.type === 'assets-ready'
      ? { assets: selected.assets, uploads: [], errors: [] }
      : undefined;
  }
  if (result.type !== 'picked-files') return undefined;

  const picked = result as PickedFiles;
  // One new file is the same decision as a single media block: its editor
  // opens straight away, so a variant can be made before the tile is placed.
  // Only a batch skips the editor and takes the originals as they are.
  const [single] = picked.files;
  if (
    picked.files.length === 1 &&
    single &&
    !single.existingAsset &&
    !picked.errors.length
  ) {
    try {
      const edited = await openModal(editFileModal, {
        source: { kind: 'file', file: single },
        maxSize,
        acceptedExtensions,
        sizeLimitPolicy: options.sizeLimitPolicy,
        uploadProfile: options.uploadProfile,
        usageDelta: options.usageDelta,
      });
      if (edited.type === 'error')
        return {
          assets: [],
          uploads: [],
          errors: [{ fileName: single.name, message: edited.message }],
        };
      return edited.type === 'asset-ready'
        ? { assets: [edited.asset], uploads: [], errors: [] }
        : undefined;
    } finally {
      URL.revokeObjectURL(single.objectUrl);
    }
  }
  // New files go up first, three at a time, while the admin settles any
  // duplicates; each keeps a preview of its own, so the picker's can go.
  const uploads = picked.files
    .filter((file) => !file.existingAsset)
    .map((file) => {
      URL.revokeObjectURL(file.objectUrl);
      return new PendingOriginalUpload(file.file, {
        constraints: {
          acceptedExtensions,
          maxSize,
          sizeLimitPolicy: options.sizeLimitPolicy,
        },
      });
    });
  void runAssetBatch(uploads, (upload) => upload.run(), 3);

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
  return {
    assets: [
      ...new Map(
        picked.files.flatMap((file) => {
          const asset = resolved.get(file);
          return asset ? [[asset.assetUuid, asset] as const] : [];
        }),
      ).values(),
    ],
    uploads,
    errors,
  };
}

export function launchAssetEditor(
  asset: AssetVariantInfo,
  options: AssetWizardOptions = {},
): Promise<AssetVariantInfo | undefined> {
  return runModalFlow(() => runAssetEditor(asset, options));
}

async function runAssetEditor(
  asset: AssetVariantInfo,
  options: AssetWizardOptions,
): Promise<AssetVariantInfo | undefined> {
  while (true) {
    const editResult = await openModal(editFileModal, {
      source: { kind: 'asset', asset },
      maxSize: resolveAssetMaxSize(options.sizeLimitPolicy, options.maxSize),
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

/**
 * The asset editor for a pasted file the text is still storing.
 *
 * It opens on the draft the block staged, so the file does not cross the
 * network again; the block keeps that draft and deletes it when it is done.
 * "Pick another file" leads into the usual wizard, as it does from any
 * editor. Nothing means the editor was dismissed: the block goes on with
 * the default.
 */
export function launchPendingFileEditor(
  pending: PendingMediaHandover,
  options: AssetWizardOptions = {},
): Promise<AssetVariantInfo | undefined> {
  return runModalFlow(() => runPendingFileEditor(pending, options));
}

async function runPendingFileEditor(
  pending: PendingMediaHandover,
  options: AssetWizardOptions,
): Promise<AssetVariantInfo | undefined> {
  const editResult = await openModal(editFileModal, {
    source: { kind: 'draft', draft: pending.draft, file: pending.file },
    maxSize: resolveAssetMaxSize(options.sizeLimitPolicy, options.maxSize),
    acceptedExtensions:
      options.acceptedExtensions ??
      acceptedExtensionsFromAccept(options.accept ?? anyFileExtensionProfile),
    sizeLimitPolicy: options.sizeLimitPolicy,
    uploadProfile: options.uploadProfile,
    usageDelta: options.usageDelta,
  });
  if (editResult.type === 'error') throw new Error(editResult.message);
  if (editResult.type === 'upload-new' || editResult.type === 'asset-missing') {
    return await launchAssetWizard(options);
  }
  return editResult.type === 'asset-ready' ? editResult.asset : undefined;
}

/** A stored file as a text block carries it. */
export function contentAssetFromVariant(
  asset: AssetVariantInfo,
): ContentAssetData {
  const result = mapAssetVariantToReplaceResult(asset);
  return {
    assetUuid: asset.assetUuid,
    type: asset.type,
    extension: asset.extension,
    size: asset.size,
    media: result.media,
    ...(result.audio ? { audio: result.audio } : {}),
    assetUrl: result.assetUrl,
    archivedOriginal:
      asset.type === AssetType.Other &&
      asset.meta &&
      'archivedOriginal' in asset.meta
        ? asset.meta.archivedOriginal
        : undefined,
  };
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
    audio:
      asset.type === AssetType.Audio
        ? audioDescriptorFromMeta(asset.meta)
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
