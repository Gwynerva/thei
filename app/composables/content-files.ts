import type { API, BlockAPI } from '@editorjs/editorjs';
import type { ContentAssetData } from '#layers/thei/shared/content';
import {
  contentFileAssetType,
  placeContentFiles,
  prepareContentFile,
  type ContentFileSkip,
  type PlacedContentFiles,
} from '#layers/thei/shared/content-file-placement';

export interface SkippedContentFile {
  name: string;
  reason: ContentFileSkip;
}

/**
 * Files brought into a text — pasted, or picked to upload — as the site will
 * store them: a file named for another kind than it is renamed by its type,
 * and one the site cannot store is set aside to be told of.
 */
export function prepareContentFiles(files: readonly File[]): {
  files: File[];
  skipped: SkippedContentFile[];
} {
  const prepared: File[] = [];
  const skipped: SkippedContentFile[] = [];
  for (const file of files) {
    const result = prepareContentFile(file);
    if ('skipped' in result) {
      skipped.push({ name: file.name, reason: result.skipped });
      continue;
    }
    prepared.push(
      result.name === file.name
        ? file
        : new File([file], result.name, {
            type: file.type,
            lastModified: file.lastModified,
          }),
    );
  }
  return { files: prepared, skipped };
}

/** The blocks files brought into a text together become. */
export function placeContentFilesOf(
  assets: readonly ContentAssetData[],
  files: readonly File[],
): PlacedContentFiles[] {
  return placeContentFiles<File>([
    ...assets.map((asset) => ({ asset })),
    ...files.map((file) => ({
      file,
      assetType: contentFileAssetType(file.name),
      size: file.size,
    })),
  ]);
}

/**
 * A placed block put into the editor, then handed its new files: a block
 * stores its own, once it is on the page.
 */
export function insertPlacedFiles(
  blocks: API['blocks'],
  placed: PlacedContentFiles,
  index: number,
  needToFocus: boolean,
  replace: boolean,
): BlockAPI {
  const { files, ...data } = placed.data as { files?: File[] };
  const inserted = blocks.insert(
    placed.type,
    data,
    undefined,
    index,
    needToFocus,
    replace,
  );
  if (files?.length) inserted.call('adoptFiles', files);
  return inserted;
}

/** What the owner is told of the files left out, one line for them all. */
export function skippedContentFilesMessage(
  skipped: readonly SkippedContentFile[],
): string | undefined {
  if (!skipped.length) return undefined;
  return skipped
    .map(({ name, reason }) => phrase.value.content_file_skipped(name, reason))
    .join(' · ');
}
