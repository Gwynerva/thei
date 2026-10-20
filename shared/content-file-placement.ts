import { AssetType } from './asset';
import { ASSET_UPLOAD_LIMITS } from './asset-upload-limits';
import { getAssetMediaKind, type AssetMediaKind } from './assets/formats';
import { getPathExtension } from './assets/extensions';
import {
  contentFileBlockAccepts,
  type ContentAssetData,
  type ContentFileBlockType,
} from './content';

/**
 * What the browser's own type says a file is, as the extension the site
 * reads that kind under. The server goes by the extension alone, so a file
 * whose name says one thing and whose type another is named by its type —
 * a voice note saved as `.webm` is a recording, not a video.
 */
const EXTENSION_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'weba',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
};

const ASSET_TYPE_BY_KIND: Record<AssetMediaKind, AssetType> = {
  image: AssetType.Image,
  video: AssetType.Video,
  audio: AssetType.Audio,
  other: AssetType.Other,
};

/** Why a file the owner brought is left out, with the others still placed. */
export type ContentFileSkip = 'extension' | 'empty' | 'size';

export type PreparedContentFile =
  { name: string; assetType: AssetType } | { skipped: ContentFileSkip };

/**
 * A file brought into a text — pasted, or picked to upload — as the site
 * will store it: the name its extension is read from, and the kind of file
 * that makes it. A file the site cannot store is skipped with the reason,
 * rather than becoming a block whose upload can never succeed: one with no
 * extension and no type to give it one, an empty one (a folder copied from
 * the file manager arrives as one), one over the limit of every block.
 */
export function prepareContentFile(file: {
  name: string;
  type: string;
  size: number;
}): PreparedContentFile {
  if (!file.size) return { skipped: 'empty' };
  if (file.size > ASSET_UPLOAD_LIMITS.file) return { skipped: 'size' };
  const extension = getPathExtension(file.name);
  const typed = EXTENSION_BY_TYPE[file.type.toLowerCase()];
  let name = file.name;
  if (!extension) {
    if (!typed) return { skipped: 'extension' };
    name = `${file.name || 'file'}.${typed}`;
  } else if (
    typed &&
    getAssetMediaKind(typed) !== 'other' &&
    getAssetMediaKind(typed) !== getAssetMediaKind(extension)
  ) {
    name = `${file.name.slice(0, -extension.length)}${typed}`;
  }
  return { name, assetType: contentFileAssetType(name) };
}

/** The kind of file an extension makes, as the server reads it. */
export function assetTypeOfExtension(extension: string): AssetType {
  return ASSET_TYPE_BY_KIND[getAssetMediaKind(extension)];
}

/** The kind of file a name makes, as the server reads it. */
export function contentFileAssetType(name: string): AssetType {
  return assetTypeOfExtension(getPathExtension(name));
}

/** Whether a stored file may be shown in a block of this kind. */
export function contentFileBlockTakes(
  type: ContentFileBlockType,
  asset: ContentAssetData,
): boolean {
  return contentFileBlockAccepts(type, entryFile({ asset }));
}

/** A file to place: one already in the library, or one still to be stored. */
export type ContentFileEntry<TFile> =
  | { asset: ContentAssetData }
  | { file: TFile; assetType: AssetType; size: number };

/** A block the placed files make, with the files still to be stored. */
export interface PlacedContentFiles {
  type: ContentFileBlockType;
  data: Record<string, unknown>;
}

/**
 * The blocks files brought into a text together become, in order: the ones
 * shown as pictures — one picture or video, or a gallery of several — then
 * the rest — a recording played in place or a file to download, or a group
 * of several. A picture or video too large to be shown is a file. Files
 * already in the library are placed as they are; new ones ride in `files`,
 * for the block to store.
 *
 * The same rule places what the "+" picks, what is pasted, and what an empty
 * block of any kind is given, so a file looks the same however it came.
 */
export function placeContentFiles<TFile>(
  entries: readonly ContentFileEntry<TFile>[],
): PlacedContentFiles[] {
  const shown = entries.filter((entry) =>
    contentFileBlockAccepts('contentMedia', entryFile(entry)),
  );
  const rest = entries.filter((entry) => !shown.includes(entry));
  return [
    ...(shown.length === 1
      ? [single('contentMedia', shown[0]!, { layout: 'centered' })]
      : shown.length
        ? [list('contentGallery', shown)]
        : []),
    ...(rest.length === 1
      ? [
          single(
            contentFileBlockAccepts('contentAudio', entryFile(rest[0]!))
              ? 'contentAudio'
              : 'contentAttachment',
            rest[0]!,
          ),
        ]
      : rest.length
        ? [list('contentFileGroup', rest)]
        : []),
  ];
}

/** A file's kind, and the size its block's limit is measured on. */
function entryFile(entry: ContentFileEntry<unknown>) {
  if (!('asset' in entry)) return { type: entry.assetType, size: entry.size };
  return {
    type: entry.asset.type ?? AssetType.Other,
    // As the server measures a stored file: the original it keeps counts.
    size: Math.max(
      entry.asset.size ?? 0,
      entry.asset.archivedOriginal?.size ?? 0,
    ),
  };
}

function single<TFile>(
  type: ContentFileBlockType,
  entry: ContentFileEntry<TFile>,
  data: Record<string, unknown> = {},
): PlacedContentFiles {
  return {
    type,
    data: {
      ...data,
      ...('asset' in entry ? { asset: entry.asset } : { files: [entry.file] }),
    },
  };
}

function list<TFile>(
  type: ContentFileBlockType,
  entries: readonly ContentFileEntry<TFile>[],
): PlacedContentFiles {
  const files = entries.flatMap((entry) =>
    'asset' in entry ? [] : [entry.file],
  );
  return {
    type,
    data: {
      items: entries.flatMap((entry) =>
        'asset' in entry
          ? [{ id: crypto.randomUUID(), asset: entry.asset }]
          : [],
      ),
      ...(files.length ? { files } : {}),
    },
  };
}
