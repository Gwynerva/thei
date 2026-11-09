import { AssetType } from './asset';
import type { AssetSourceType } from './asset-library';
import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
} from './assets/formats';
import { parseDayQuery } from './day-query';
import { createSearchAnalyzer, type SearchAnalyzer } from './language/search';
import { normalizeTermText } from './text-terms';

/**
 * A search of the file library read the way a person types it: «видео
 * эльбрус», «дневник март 2024», «pdf вчера». Some words say how to narrow
 * the files rather than what they are about:
 *
 * - a day, or part of one, in any way `day-query.ts` reads it — the day of
 *   the place a file is in: a diary entry's day, an event's, a section's;
 * - a word for a day near today, «вчера» — the day a file was uploaded;
 * - a kind of file, «фото», «видео», or a place, «дневник», «проект»: a word
 *   of the packs' `libraryWords`, matched whole, never by its stem;
 * - a file's format by its extension: «jpg» or «mov» is a kind of file,
 *   since a picture or a video is stored converted and keeps no extension
 *   it came with; «pdf» is the extension itself.
 *
 * Several of one kind are any of them: «фото видео» is pictures or videos.
 * Each is shown back as a chip the person can take off, which removes its
 * words from the search. A word read so may still be one the owner wrote —
 * «вчера» in a caption, «видео» in a description — so the server takes a
 * kind's parts as their filters or their own words, never the filters alone:
 * reading a search only ever finds more than its words would. The page and
 * the server read a search with this same function, so a chip is exactly
 * what the server applied.
 */
export type LibrarySearchPart = {
  /** Where its words stand in the search as typed. */
  start: number;
  end: number;
  /** The words as typed. */
  text: string;
} & (
  | {
      kind: 'date';
      /** The words to read as a day (`parseDayQuery`), unfinished at the end only. */
      value: string;
    }
  /** The day of upload, as days from today: 0 is today, −1 yesterday. */
  | { kind: 'uploaded'; value: number }
  | { kind: 'type'; value: AssetType }
  | { kind: 'extension'; value: string }
  | { kind: 'place'; value: AssetSourceType[] }
);
export type LibrarySearchPartKind = LibrarySearchPart['kind'];

export interface LibrarySearch {
  /** What is left to be matched against the words of the archive. */
  words: string;
  parts: LibrarySearchPart[];
}

/** Formats kept as uploaded, so their extension is what is stored. */
const KEPT_EXTENSIONS = new Set([
  'pdf',
  'zip',
  'txt',
  'md',
  'doc',
  'docx',
  'odt',
  'rtf',
  'xls',
  'xlsx',
  'ods',
  'ppt',
  'pptx',
  'odp',
  'csv',
  'epub',
]);
/** Formats of media, which are stored converted: the extension names a kind. */
const MEDIA_EXTENSIONS = new Map<string, AssetType>([
  ...[...IMAGE_EXTENSIONS, 'heic', 'heif', 'tif', 'tiff', 'bmp'].map(
    (extension) => [extension, AssetType.Image] as const,
  ),
  ...[...VIDEO_EXTENSIONS, 'mkv', 'm4v'].map(
    (extension) => [extension, AssetType.Video] as const,
  ),
  ...AUDIO_EXTENSIONS.map((extension) => [extension, AssetType.Audio] as const),
]);

const PLACES: Record<string, AssetSourceType[]> = {
  'diary-entry': ['diary-entry'],
  event: ['event'],
  project: ['project', 'project-section'],
  'project-section': ['project-section'],
  page: ['page'],
};
const TYPES: Record<string, AssetType> = {
  image: AssetType.Image,
  video: AssetType.Video,
  audio: AssetType.Audio,
  other: AssetType.Other,
};

let wordReader: SearchAnalyzer | undefined;
/** Both scripts whatever the site speaks, the same on the server and in the page. */
function reader() {
  wordReader ??= createSearchAnalyzer('en');
  return wordReader;
}

const TOKEN = /[\p{L}\p{N}]+(?:[./-][\p{L}\p{N}]+)*/gu;

export function readLibrarySearch(search: string): LibrarySearch {
  const tokens = [...search.matchAll(TOKEN)].map((match) => ({
    text: match[0],
    start: match.index,
    end: match.index + match[0].length,
    taken: false,
  }));
  const parts: LibrarySearchPart[] = [];
  const take = <K extends LibrarySearchPartKind>(
    kind: K,
    value: Extract<LibrarySearchPart, { kind: K }>['value'],
    from: number,
    to = from,
  ) => {
    for (let at = from; at <= to; at++) tokens[at]!.taken = true;
    const start = tokens[from]!.start;
    const end = tokens[to]!.end;
    parts.push({
      kind,
      value,
      start,
      end,
      text: search.slice(start, end),
    } as LibrarySearchPart);
  };
  const analyzer = reader();

  tokens.forEach((token, at) => {
    const word = normalizeTermText(token.text);
    const day = analyzer.relativeDay(word);
    if (day !== undefined) return take('uploaded', day, at);
    const named = analyzer.libraryWordOf(word);
    // «файлы» is every file: it narrows nothing, and asks no word of a text.
    if (named === 'any') return void (token.taken = true);
    if (named && TYPES[named]) return take('type', TYPES[named], at);
    if (named && PLACES[named]) return take('place', PLACES[named], at);
    const media = MEDIA_EXTENSIONS.get(word);
    if (media) return take('type', media, at);
    if (KEPT_EXTENSIONS.has(word)) return take('extension', word, at);
  });

  // Every run of words left that reads as a day, the longest from each start.
  for (let from = 0; from < tokens.length; from++) {
    if (tokens[from]!.taken) continue;
    for (let to = Math.min(tokens.length, from + 3) - 1; to >= from; to--) {
      if (tokens.slice(from, to + 1).some((token) => token.taken)) continue;
      const text = search.slice(tokens[from]!.start, tokens[to]!.end);
      // A part still being typed is read as unfinished only at the very end.
      const atEnd = search.slice(tokens[to]!.end).trim() === '';
      const value = atEnd ? text : `${text} `;
      if (!plausible(text) || !parseDayQuery(value)) continue;
      take('date', value, from, to);
      break;
    }
  }

  return {
    // Marks with no words between them are still a search, of nothing.
    words: tokens.length
      ? tokens
          .filter((token) => !token.taken)
          .map((token) => token.text)
          .join(' ')
      : search.trim(),
    parts: parts.sort((a, b) => a.start - b.start),
  };
}

/** A search without one of its parts, as if its words were never typed. */
export function withoutLibrarySearchPart(
  search: string,
  part: Pick<LibrarySearchPart, 'start' | 'end'>,
): string {
  return `${search.slice(0, part.start)} ${search.slice(part.end)}`
    .replace(/\s+/g, ' ')
    .trim();
}

/** A lone number reads as a day only when it can be a year of a life. */
function plausible(text: string) {
  return !/^\d+$/.test(text) || (Number(text) >= 1800 && Number(text) < 2200);
}
