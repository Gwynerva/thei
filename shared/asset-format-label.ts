import { AssetType, type ArchivedOriginalFileMeta } from './asset';
import { normalizeAssetExtension } from './assets/formats';
import { assetPreview } from './assets/preview';
import { assetTypeOfExtension } from './content-file-placement';
import type { LanguagePhrases } from './language/types';

/**
 * How a file is named by what it is, in the site's language — the admin's
 * pages and a visitor's window, and the server, where a session's title
 * names a file placed nowhere — one wording for all of them.
 */

/** What kind of file it is, in a word: the name of a file's window. */
export function assetKindName(phrase: LanguagePhrases, type: AssetType) {
  return {
    [AssetType.Image]: phrase.image,
    [AssetType.Video]: phrase.video,
    [AssetType.Audio]: phrase.audio,
    [AssetType.Other]: phrase.asset,
  }[type];
}

/**
 * What a file is, for a reader who has no title to go by: a picture, a video
 * or a recording by its kind; any other file by the format a person knows it
 * as — a PDF document, a ZIP archive — and failing that, by its extension. A
 * file kept zipped is named by its original, as it is shown.
 */
export function assetFormatName(
  phrase: LanguagePhrases,
  extension: string,
  archivedOriginal?: ArchivedOriginalFileMeta,
): string {
  const type = assetTypeOfExtension(extension);
  if (type !== AssetType.Other) return assetKindName(phrase, type);
  const kind = assetPreview(extension, archivedOriginal)?.kind;
  return phrase.asset_format(
    !kind || kind === 'probe' ? 'other' : kind,
    normalizeAssetExtension(archivedOriginal?.extension ?? extension),
  );
}
