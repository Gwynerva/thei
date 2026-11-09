import {
  createEmptyContentFieldValue,
  isContentEmpty,
  normalizeContentData,
  type ContentFieldModelValue,
} from './content';
import { optionalContentDraftRef } from './content-history';
import { comparePeriods, normalizePeriods, type Period } from './period';
import { coverDateRanges } from './date-range';
import { sortPublicTimelineItemsNewestFirst } from './public-timeline';
import type { MediaDescriptor } from './media';
import { normalizeHeadingText } from './terminal-punctuation';
import {
  normalizeHumanReadableSlug,
  normalizePublicId,
  publicIdIsValid,
} from './public-link';

/**
 * A part of a project: a write-up with a title, a body and an address of its
 * own. It may be about stretches of time — then its periods put it on the
 * project's chronology and it reads among the stages, in time order — or
 * about a part of the project, a general section read in the order the owner
 * gives. It needs a body or a period, or it would say nothing at all.
 */
export interface ProjectSectionItem {
  sectionUuid?: string;
  title: string;
  summary: string;
  humanReadableSlug: string;
  publicId: string;
  isPrivate: boolean;
  /** Empty for a section that is not about a stretch of time. */
  periods: Period[];
  /** Empty for a section that is only its dates. */
  content: ContentFieldModelValue;
  /** The picture the section's page opens with and its cards show. */
  bannerAssetUuid?: string;
  /** How the form shows that banner; the server never reads it. */
  bannerMedia?: MediaDescriptor;
}

export type ProjectSectionValue = ProjectSectionItem & { sectionUuid: string };

/** An id a form sends back, or none. */
export function normalizeContentItemId(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return id || undefined;
}

/**
 * What a project's section and an excerpt are both made of: a part with a
 * title, a text and a page of its own.
 */
export type ContentItemFields = {
  title: string;
  summary: string;
  humanReadableSlug: string;
  publicId: string;
  isPrivate: boolean;
  content: ContentFieldModelValue;
  bannerAssetUuid?: string;
};

/**
 * The fields a project's section and an excerpt share, as they are saved:
 * a title, a summary, an address, the owner's privacy, a text and a banner.
 * What neither may be is refused with the part's own error, by its name.
 */
export function normalizeContentItemFields(
  source: Record<string, unknown>,
  part: { name: 'section' | 'excerpt'; error: new (message: string) => Error },
): ContentItemFields {
  const title =
    typeof source.title === 'string'
      ? normalizeHeadingText(source.title.trim())
      : '';
  if (!title)
    throw new part.error(
      `${part.name === 'section' ? 'Section' : 'Excerpt'} title cannot be empty`,
    );
  if (typeof source.isPrivate !== 'boolean')
    throw new part.error(`Invalid ${part.name} privacy`);
  const contentSource =
    source.content && typeof source.content === 'object'
      ? (source.content as Record<string, unknown>)
      : undefined;
  const content: ContentFieldModelValue = contentSource
    ? {
        contentUuid: normalizeContentItemId(contentSource.contentUuid),
        data: normalizeContentData(contentSource.data),
        ...(typeof contentSource.updatedAt === 'number'
          ? { updatedAt: contentSource.updatedAt }
          : {}),
        ...optionalContentDraftRef(contentSource.draftRef),
      }
    : createEmptyContentFieldValue();
  const publicId = normalizePublicId(source.publicId);
  if (!publicIdIsValid(publicId)) throw new part.error('Invalid public ID');
  return {
    title,
    summary: typeof source.summary === 'string' ? source.summary.trim() : '',
    humanReadableSlug: normalizeHumanReadableSlug(source.humanReadableSlug),
    publicId,
    isPrivate: source.isPrivate,
    content,
    ...(typeof source.bannerAssetUuid === 'string' && source.bannerAssetUuid
      ? { bannerAssetUuid: source.bannerAssetUuid }
      : {}),
  };
}

export function isDatedSection(section: Pick<ProjectSectionItem, 'periods'>) {
  return section.periods.length > 0;
}

/** Oldest first, by the first of each section's periods. */
function compareDatedSections(
  left: Pick<ProjectSectionItem, 'periods'>,
  right: Pick<ProjectSectionItem, 'periods'>,
) {
  return comparePeriods(left.periods[0]!, right.periods[0]!);
}

/**
 * The stages — the dated sections — as every list of them reads: newest
 * first, by the end of the stretch each covers, then by its start. A stage's
 * number counts the other way, from the oldest.
 */
export function sortStagesNewestFirst<
  T extends Pick<ProjectSectionItem, 'periods'>,
>(sections: readonly T[]): T[] {
  return sortPublicTimelineItemsNewestFirst(
    sections.filter(isDatedSection),
    (section) => coverDateRanges(section.periods),
  );
}

/**
 * The one order a project keeps its sections in: those without dates as the
 * owner arranged them, then the dated ones by their first period. Only the
 * first half is the owner's; the stored position of a dated section says
 * nothing, and is rewritten from this order on every save.
 */
export function orderProjectSections<
  T extends Pick<ProjectSectionItem, 'periods'>,
>(sections: readonly T[]): T[] {
  return [
    ...sections.filter((section) => !isDatedSection(section)),
    ...sections.filter(isDatedSection).sort(compareDatedSections),
  ];
}

export function normalizeProjectSections(
  value: unknown,
): ProjectSectionItem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value))
    throw new ProjectContentItemError('Invalid sections');
  return orderProjectSections(value.map(normalizeProjectSection));
}

export class ProjectContentItemError extends Error {}

function normalizeProjectSection(value: unknown): ProjectSectionItem {
  if (!value || typeof value !== 'object')
    throw new ProjectContentItemError('Invalid section');
  const source = value as Record<string, unknown>;
  const fields = normalizeContentItemFields(source, {
    name: 'section',
    error: ProjectContentItemError,
  });
  const periods =
    Array.isArray(source.periods) && source.periods.length
      ? normalizePeriods(source.periods)
      : [];
  if (!periods.length && isContentEmpty(fields.content.data))
    throw new ProjectContentItemError('A section needs a body or a period');
  const { content, bannerAssetUuid, ...named } = fields;
  return {
    sectionUuid: normalizeContentItemId(source.sectionUuid),
    ...named,
    periods,
    content,
    ...(bannerAssetUuid ? { bannerAssetUuid } : {}),
  };
}
