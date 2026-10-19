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
 * apart by nothing — and by its format only where it has neither.
 */
export function searchHitTitle(hit: SearchHit): string {
  if (hit.kind === 'diary-entry' && hit.date)
    return formatAbsolutePublicDate(hit.date, language.value.code);
  if (hit.title) return publicText(hit.title);
  if (hit.kind === 'file' && hit.summary) return publicText(hit.summary);
  return hit.file ? fileKindName(hit.file.type) : '';
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

/** When it was: its period, or its day — none for a diary entry, named by it. */
export function searchHitWhen(hit: SearchHit): string {
  if (hit.period)
    return hit.period.startDate === hit.period.endDate
      ? formatAbsolutePublicDate(hit.period.startDate, language.value.code)
      : formatPublicDateRange(hit.period, language.value.code);
  if (hit.date && hit.kind !== 'diary-entry')
    return formatAbsolutePublicDate(hit.date, language.value.code);
  return '';
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
  const label = find.label ? publicText(find.label) : '';
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

/** Who else may see it, for the owner: its lock and its words. */
export function searchAccessBadge(
  access: SearchHit['access'],
): { icon: IconName; text: string } | undefined {
  if (access === 'private')
    return { icon: 'lock-close', text: phrase.value.search_access_private };
  if (access === 'link-only')
    return { icon: 'lock-partial', text: phrase.value.search_access_link };
  return undefined;
}
