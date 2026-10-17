import { eq } from 'drizzle-orm';
import {
  contentBlockFileWords,
  contentBlockIsInPrivateSection,
  contentBlockTextParts,
  isContentFileBlockType,
  normalizeContentData,
  normalizedContentPrivateSectionRanges,
  type ContentFileBlockType,
  type ContentFileWords,
  type ContentOutputData,
} from '#layers/thei/shared/content';
import type { AssetSource } from '#layers/thei/shared/asset-library';
import { entityTextOfSlot, isEntityKind } from '../entity-kinds';
import { readAssetPlaceUses } from './library';

/**
 * What the places of a file say of it, as stored: the captions and titles it
 * is given there, the heading it stands under in a text and the text just
 * around it. A model reads them beside the file, since they tell what the
 * file alone may not — who is in a picture, where, what a recording is of.
 */

/** How much of the text on each side of a file is read. */
const EXCERPT = 280;

/** One place of a file in a text. */
export interface FileTextPlace {
  /** The block the file is in: what a list's title in `words` is the title of. */
  block: ContentFileBlockType;
  /** The heading the file stands under. */
  heading?: string;
  words: ContentFileWords;
  /** The nearest text before the file and after it, up to its heading. */
  before?: string;
  after?: string;
  /** In a private part of the text. */
  isPrivate: boolean;
}

/**
 * Every place of a file in a text. A place in a public part reads only the
 * public parts around it, as a stranger reads them.
 */
export function fileTextPlaces(
  data: ContentOutputData,
  assetUuid: string,
): FileTextPlace[] {
  const { blocks } = data;
  const ranges = normalizedContentPrivateSectionRanges(data);
  const textOf = (index: number) =>
    contentBlockTextParts(blocks[index]!, false).join(' ');
  const places: FileTextPlace[] = [];
  blocks.forEach((block, index) => {
    const found = contentBlockFileWords(block, assetUuid);
    if (!found.length || !isContentFileBlockType(block.type)) return;
    const type = block.type;
    const isPrivate = contentBlockIsInPrivateSection(ranges, index);
    const readable = (other: number) =>
      isPrivate || !contentBlockIsInPrivateSection(ranges, other);
    let heading: string | undefined;
    for (let other = index - 1; other >= 0 && heading === undefined; other--)
      if (blocks[other]!.type === 'header' && readable(other))
        heading = textOf(other);
    const near = (step: 1 | -1) => {
      for (
        let other = index + step;
        other >= 0 && other < blocks.length;
        other += step
      ) {
        if (!readable(other)) continue;
        if (blocks[other]!.type === 'header') return undefined;
        const text = textOf(other);
        if (text) return text;
      }
      return undefined;
    };
    const before = near(-1);
    const after = near(1);
    for (const words of found)
      places.push({
        block: type,
        ...(heading ? { heading } : {}),
        words,
        ...(before ? { before: ending(before) } : {}),
        ...(after ? { after: opening(after) } : {}),
        isPrivate,
      });
  });
  return places;
}

/** The start of a text, cut between words. */
function opening(text: string): string {
  if (text.length <= EXCERPT) return text;
  const cut = text.lastIndexOf(' ', EXCERPT);
  return `${text.slice(0, cut > EXCERPT / 2 ? cut : EXCERPT)}…`;
}

/** The end of a text, cut between words. */
function ending(text: string): string {
  if (text.length <= EXCERPT) return text;
  const from = text.length - EXCERPT;
  const cut = text.indexOf(' ', from);
  return `…${text.slice(cut >= 0 && cut < from + EXCERPT / 2 ? cut + 1 : from)}`;
}

/** What one place says of a file. */
export interface FilePlaceWords extends Partial<FileTextPlace> {
  source: AssetSource;
  /** Where in the place: one of its texts by name, its showcase, its files, a status. */
  where: string;
  words: ContentFileWords;
  /** Only the owner reads it. */
  isPrivate: boolean;
}

/**
 * What every place of a file says of it, in the order of its places. A
 * place that gives it no words of its own — a banner, an icon, a session —
 * says nothing here: its title is in the list of places.
 */
export function filePlaceWords(assetUuid: string): FilePlaceWords[] {
  const { db, schema } = THEI_SERVER.useDb();
  const said: FilePlaceWords[] = [];
  for (const use of readAssetPlaceUses(assetUuid)) {
    const { source, meta } = use;
    if (use.containerType === 'content') {
      const row = db
        .select({ slot: schema.content.slot, data: schema.content.data })
        .from(schema.content)
        .where(eq(schema.content.contentUuid, use.containerId))
        .get();
      if (!row) continue;
      const text = isEntityKind(source.type)
        ? entityTextOfSlot(source.type, row.slot)
        : undefined;
      for (const place of fileTextPlaces(
        normalizeContentData(row.data),
        assetUuid,
      ))
        said.push({
          ...place,
          source,
          where: text?.name ?? 'text',
          isPrivate: use.sourcePrivate || !!text?.private || place.isPrivate,
        });
    } else if (meta?.role === 'showcase-asset' && meta.caption)
      said.push({
        source,
        where: 'showcase',
        words: { caption: meta.caption },
        isPrivate: use.sourcePrivate || meta.isPrivate,
      });
    else if (meta?.role === 'other-asset' && (meta.title || meta.caption))
      said.push({
        source,
        where: 'files',
        words: { title: meta.title, caption: meta.caption },
        isPrivate: use.sourcePrivate || meta.isPrivate,
      });
    else if (use.statusText)
      said.push({
        source,
        where: 'status',
        words: { caption: use.statusText },
        isPrivate: use.sourcePrivate,
      });
  }
  return said;
}
