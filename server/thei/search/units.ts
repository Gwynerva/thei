import {
  contentBlockTextParts,
  isContentFileBlockType,
  type ContentOutputBlock,
  type PublicContentOutputData,
} from '#layers/thei/shared/content';
import type { MediaDescriptor } from '#layers/thei/shared/media';
import { richTextToPlainText } from '#layers/thei/shared/rich-text';
import type { SearchFindWhere } from '#layers/thei/shared/search/api';
import type { LandingZone } from '#layers/thei/shared/search/landing';

/**
 * The columns of the index, each weighed by how much a word in it says about
 * what the entity is: a word of the title more than one in a caption.
 */
export const SEARCH_FIELDS = [
  'title',
  'names',
  'headings',
  'summary',
  'text',
  'extra',
] as const;
export type SearchField = (typeof SEARCH_FIELDS)[number];
export const SEARCH_FIELD_WEIGHTS: Record<SearchField, number> = {
  title: 10,
  names: 6,
  headings: 3,
  summary: 4,
  text: 1,
  extra: 1.5,
};

/** Where in an entity a unit stands, for its find to say and to lead to. */
export interface SearchPlace {
  /** Where it is, when that is another page than the document's own. */
  href?: string;
  /** A section of a project: its title and address. */
  section?: { id: string; title: string; href: string };
  /** The block of a text, by the id it keeps; the page anchors it. */
  block?: string;
  /**
   * A file shown there, by its family, and by the id the page names it by:
   * its public one.
   */
  file?: { familyUuid: string; assetUuid: string; title?: string };
  /**
   * The other end of what the words are about: a related entity, by its kind
   * and address, which the relations block shows it by; a tag; a link.
   */
  relation?: { title: string; kind?: string; href?: string };
  /** A link of the page, by its address. */
  link?: string;
  /** A status, by its day. */
  status?: { date: string };
  /** The part of the page outside its text the words stand in. */
  zone?: LandingZone;
}

/**
 * One place a word can be found in: a title, a block, a caption, a file's
 * description where it is shown, a note. Text is what the owner typed, plain;
 * it is formatted only on the way out.
 */
export interface SearchUnit {
  field: SearchField;
  where: SearchFindWhere;
  text: string;
  place?: SearchPlace;
  /** Found by, never shown: another name of the entity. */
  hidden?: true;
  /** A file's preview, for a find in a file. */
  media?: MediaDescriptor;
}

const HINT = /data-content-(hint|note)="([^"]*)"/gu;

function decodeAttribute(value: string) {
  return richTextToPlainText(value.replaceAll('&quot;', '"'));
}

/** The hints and link notes of a piece of inline markup. */
function inlineNotes(html: unknown, place: SearchPlace): SearchUnit[] {
  if (typeof html !== 'string' || !html.includes('data-content-')) return [];
  const units: SearchUnit[] = [];
  for (const [, kind, value] of html.matchAll(HINT)) {
    const text = decodeAttribute(value!);
    if (text)
      units.push({
        field: 'extra',
        where: kind === 'hint' ? 'hint' : 'link',
        text,
        place,
      });
  }
  return units;
}

/** Every string of inline markup a block holds, deep. */
function blockStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) for (const item of value) blockStrings(item, into);
  else if (value && typeof value === 'object')
    for (const [key, item] of Object.entries(value))
      if (key !== 'asset' && key !== 'media') blockStrings(item, into);
  return into;
}

interface FileShown {
  asset: { assetUuid: string; familyUuid?: string; alt?: string; media?: MediaDescriptor } | null;
  title?: string;
  caption?: string;
}

/** The files a hydrated block shows, with the words it gives each. */
function shownFiles(block: ContentOutputBlock): FileShown[] {
  if (!isContentFileBlockType(block.type)) return [];
  const data = block.data as Record<string, unknown>;
  const one = (source: Record<string, unknown>): FileShown => ({
    asset: (source.asset as FileShown['asset']) ?? null,
    title: typeof source.title === 'string' ? source.title : undefined,
    caption: typeof source.caption === 'string' ? source.caption : undefined,
  });
  if ('asset' in data) return [one(data)];
  return Array.isArray(data.items)
    ? data.items.map((item) => one(item as Record<string, unknown>))
    : [];
}

/**
 * The units of a text as its page serves it to this reader: blocks of a
 * private part the reader may not see are already folded away
 * (`privateSectionPlaceholder`), an expanded one is read like the rest, a
 * link to an entity the reader may not open has already lost its note, and
 * a file the reader may not have is `null`.
 */
export function contentUnits(
  data: PublicContentOutputData | null | undefined,
  base: SearchPlace = {},
): SearchUnit[] {
  const units: SearchUnit[] = [];
  const visit = (blocks: readonly unknown[]) => {
    for (const raw of blocks) {
      const block = raw as ContentOutputBlock;
      const type: string = block.type;
      if (type === 'privateSectionPlaceholder') continue;
      if (type === 'privateSectionExpanded') {
        visit(((block.data as { blocks?: unknown[] }).blocks ?? []) as unknown[]);
        continue;
      }
      const place: SearchPlace = { ...base, ...(block.id ? { block: block.id } : {}) };
      const data = (block.data ?? {}) as Record<string, unknown>;
      for (const html of blockStrings(data)) units.push(...inlineNotes(html, place));
      if (isContentFileBlockType(block.type)) {
        const group = typeof data.title === 'string' ? richTextToPlainText(data.title) : '';
        if (group && Array.isArray(data.items))
          units.push({ field: 'extra', where: 'caption', text: group, place });
        for (const file of shownFiles(block)) {
          if (!file.asset) continue;
          const filePlace: SearchPlace = {
            ...place,
            file: {
              familyUuid: file.asset.familyUuid ?? file.asset.assetUuid,
              assetUuid: file.asset.assetUuid,
              ...(file.title ? { title: richTextToPlainText(file.title) } : {}),
            },
          };
          for (const words of [file.title, file.caption]) {
            const text = words ? richTextToPlainText(words) : '';
            if (text)
              units.push({ field: 'extra', where: 'caption', text, place: filePlace, media: file.asset.media });
          }
          if (file.asset.alt?.trim())
            units.push({
              field: 'extra',
              where: 'file',
              text: file.asset.alt.trim(),
              place: filePlace,
              media: file.asset.media,
            });
        }
        continue;
      }
      if (block.type === 'entityLink' || block.type === 'externalLink') {
        const note = typeof data.note === 'string' ? richTextToPlainText(data.note) : '';
        if (note) units.push({ field: 'extra', where: 'link', text: note, place });
        continue;
      }
      const text = contentBlockTextParts(block, false)
        .map(richTextToPlainText)
        .filter(Boolean)
        .join(' ');
      if (!text) continue;
      units.push(
        block.type === 'header'
          ? { field: 'headings', where: 'heading', text, place }
          : { field: 'text', where: 'text', text, place },
      );
    }
  };
  visit(data?.blocks ?? []);
  return units;
}

/** A plain field of an entity as a unit, when it has words. */
export function fieldUnit(
  field: SearchField,
  where: SearchFindWhere,
  value: string | null | undefined,
  extra: Partial<SearchUnit> = {},
): SearchUnit[] {
  const text = value ? richTextToPlainText(value) : '';
  return text ? [{ field, where, text, ...extra }] : [];
}
