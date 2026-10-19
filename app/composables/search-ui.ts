import type { IconName } from '#thei/icons';
import type {
  SearchFind,
  SearchHit,
  SearchKind,
} from '#layers/thei/shared/search/api';
import {
  formatAbsolutePublicDate,
  formatPublicDateRange,
} from '#layers/thei/shared/public-date-format';

/**
 * How the search page and the quick search name what they found: the icon
 * and the word of each kind, the title of a result, its time, and where in
 * it a find stands. One table for both, so a kind added to the search is
 * named the same way everywhere it is shown.
 */
export const SEARCH_KIND_ICONS: Record<SearchKind, IconName> = {
  project: 'project',
  'project-section': 'project-section',
  event: 'event',
  'diary-entry': 'thought',
  page: 'page',
  file: 'file',
  tag: 'tag',
  profile: 'person',
};

const FIND_ICONS: Record<SearchFind['where'], IconName> = {
  title: 'heading',
  name: 'asterisk',
  summary: 'text',
  heading: 'subheading',
  section: 'project-section',
  text: 'paragraph',
  caption: 'media',
  file: 'file',
  hint: 'hint',
  link: 'link',
  relation: 'relation-related',
  period: 'calendar',
  status: 'pulse',
  fact: 'person',
  notes: 'lock-close',
  place: 'globe',
  tag: 'tag',
  day: 'calendar',
};

/**
 * What a result is called: a diary entry by its day; a file by its title, or
 * by what it shows, its description — «JPG» three times over tells files
 * apart by nothing — and where it has neither, by its kind and where it is
 * shown: «Изображение · Смотритель маяка».
 */
export function searchHitTitle(hit: SearchHit): string {
  if (hit.kind === 'diary-entry' && hit.date)
    return formatAbsolutePublicDate(hit.date, language.value.code);
  if (hit.title) return publicText(hit.title);
  if (hit.kind === 'file' && hit.summary) return publicText(hit.summary);
  if (!hit.file) return '';
  const kind = fileKindName(hit.file.type);
  return hit.shownAt ? `${kind} · ${searchPlaceName(hit.shownAt)}` : kind;
}

/**
 * What shows a file, as a reader names it: a diary entry's day in words,
 * not as stored.
 */
function searchPlaceName(name: string): string {
  return /^\d{4}-\d{2}-\d{2}$/u.test(name)
    ? formatAbsolutePublicDate(name, language.value.code)
    : publicText(name);
}

/**
 * A file's line under its name: where it is shown, its format and size —
 * or, for a file its name already places, its format and size alone.
 */
export function searchFileLine(
  hit: SearchHit,
  size: (bytes: number) => string,
): string {
  if (!hit.file) return '';
  const named = Boolean(hit.title || hit.summary);
  return [
    named && hit.shownAt ? searchPlaceName(hit.shownAt) : '',
    hit.file.extension.toUpperCase(),
    size(hit.file.size),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** What kind of file it is, in a word: a picture, a video, a recording. */
function fileKindName(type: string): string {
  const value = phrase.value;
  if (type === 'image') return value.image;
  if (type === 'video') return value.video;
  if (type === 'audio') return value.audio;
  return value.search_kind('file');
}

/** Whether a result's title is its description, said once then. */
export function searchTitleIsSummary(hit: SearchHit): boolean {
  return hit.kind === 'file' && !hit.title && Boolean(hit.summary);
}

/**
 * When it was: its period, or its day — none for a diary entry, named by it.
 * Read by days, one with neither says the day it stands at: «Добавлено …».
 */
export function searchHitWhen(hit: SearchHit): string {
  if (hit.period)
    return hit.period.startDate === hit.period.endDate
      ? formatAbsolutePublicDate(hit.period.startDate, language.value.code)
      : formatPublicDateRange(hit.period, language.value.code);
  if (hit.date && hit.kind !== 'diary-entry')
    return formatAbsolutePublicDate(hit.date, language.value.code);
  if (hit.dated)
    return phrase.value.search_dated(
      hit.dated.by,
      formatAbsolutePublicDate(hit.dated.day, language.value.code),
    );
  return '';
}

/**
 * Its years alone, where a line has no room for its days: «2024»,
 * «2017–2019».
 */
export function searchHitYears(hit: SearchHit): string {
  const start =
    hit.period?.startDate ?? (hit.kind === 'diary-entry' ? '' : hit.date);
  const end = hit.period?.endDate ?? start;
  if (!start || !end) return '';
  const [from, to] = [start.slice(0, 4), end.slice(0, 4)];
  return from === to ? from : `${from}–${to}`;
}

/** A file's kind, format and size: «Видео · MP4 · 12 МБ». */
export function searchFileFacts(
  file: NonNullable<SearchHit['file']>,
  size: (bytes: number) => string,
): string {
  return [
    fileKindName(file.type),
    file.extension.toUpperCase(),
    size(file.size),
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Where in a result a find stands, as an icon and words. */
export function searchFindPlace(find: SearchFind): {
  icon: IconName;
  text: string;
} {
  const value = phrase.value;
  const label = find.label ? searchPlaceName(find.label) : '';
  if (find.place?.section && label)
    return { icon: 'project-section', text: value.search_where_section(label) };
  const where = value.search_where(find.where);
  // A tag found by its name shows the name in its words: once is enough.
  const named =
    find.where === 'title' || (find.where === 'tag' && find.segments.length);
  return {
    icon: FIND_ICONS[find.where],
    text: label && !named ? `${where} · ${label}` : where,
  };
}

/**
 * Who else may see it, for the owner: its lock, its words, and the same in
 * two words for a line beside the lock.
 */
export function searchAccessBadge(
  access: SearchHit['access'],
): { icon: IconName; text: string; short: string } | undefined {
  const value = phrase.value;
  if (access === 'private')
    return {
      icon: 'lock-close',
      text: value.search_access_private,
      short: value.search_access_private_short,
    };
  if (access === 'link-only')
    return {
      icon: 'lock-partial',
      text: value.search_access_link,
      short: value.search_access_link_short,
    };
  return undefined;
}
