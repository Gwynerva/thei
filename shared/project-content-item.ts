import { isContentEmpty, normalizeContentData, type ContentFieldModelValue } from './content';
import {
  dateRangeEndTime,
  dateRangeStartTime,
  isDateRangeValue,
  type DateRange,
} from './date-range';
import {
  normalizeHumanReadableSlug,
  normalizePublicId,
  publicIdIsValid,
} from './public-link';

export interface ProjectContentItemBase {
  title: string;
  summary: string;
  humanReadableSlug: string;
  publicId: string;
  isPrivate: boolean;
  content?: ContentFieldModelValue | null;
}

export type ProjectStageContentItem = ProjectContentItemBase & {
  isStage: true;
  stageUuid?: string;
  periods: DateRange[];
};

export type ProjectSectionContentItem = Omit<ProjectContentItemBase, 'content'> & {
  isStage: false;
  sectionUuid?: string;
  content: ContentFieldModelValue;
};

export type ProjectContentItemEditItem = ProjectStageContentItem | ProjectSectionContentItem;
export type ProjectStageContentValue = ProjectStageContentItem & { stageUuid: string };
export type ProjectSectionContentValue = ProjectSectionContentItem & { sectionUuid: string };

export function normalizeProjectContentItemId(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const id = value.trim();
  return id || undefined;
}

export function normalizeProjectStages(value: unknown): ProjectStageContentItem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ProjectContentItemError('Invalid stages');
  return value.map(normalizeProjectStage).sort(compareProjectStages);
}

export function compareProjectStages(left: ProjectStageContentItem, right: ProjectStageContentItem) {
  return dateRangeStartTime(left.periods[0]!.startDate) - dateRangeStartTime(right.periods[0]!.startDate) ||
    dateRangeEndTime(left.periods[0]!.endDate) - dateRangeEndTime(right.periods[0]!.endDate);
}

export function normalizeStagePeriods(value: unknown): DateRange[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new ProjectContentItemError('Stage period is required');
  const sorted = value.map((period) => {
    if (!period || typeof period !== 'object') throw new ProjectContentItemError('Invalid stage period');
    const source = period as Record<string, unknown>;
    if (!isDateRangeValue(source.startDate) || !isDateRangeValue(source.endDate) ||
      dateRangeStartTime(source.startDate) > dateRangeEndTime(source.endDate))
      throw new ProjectContentItemError('Invalid stage period');
    return { startDate: source.startDate, endDate: source.endDate };
  }).sort((a, b) => dateRangeStartTime(a.startDate) - dateRangeStartTime(b.startDate) ||
    dateRangeEndTime(a.endDate) - dateRangeEndTime(b.endDate));
  const merged: DateRange[] = [];
  for (const period of sorted) {
    const previous = merged.at(-1);
    if (previous && period.startDate <= previous.endDate) {
      if (period.endDate > previous.endDate) previous.endDate = period.endDate;
    } else merged.push({ ...period });
  }
  return merged;
}

export function normalizeProjectContentSections(value: unknown): ProjectSectionContentItem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ProjectContentItemError('Invalid content sections');
  return value.map((item) => {
    if (!item || typeof item !== 'object') throw new ProjectContentItemError('Invalid content section');
    const source = item as Record<string, unknown>;
    const title = typeof source.title === 'string' ? source.title.trim() : '';
    if (!title) throw new ProjectContentItemError('Content section title cannot be empty');
    if (typeof source.isPrivate !== 'boolean') throw new ProjectContentItemError('Invalid content section privacy');
    if (!source.content || typeof source.content !== 'object') throw new ProjectContentItemError('Content section cannot be empty');
    const contentSource = source.content as Record<string, unknown>;
    const data = normalizeContentData(contentSource.data);
    if (isContentEmpty(data)) throw new ProjectContentItemError('Content section cannot be empty');
    return {
      isStage: false as const,
      sectionUuid: normalizeProjectContentItemId(source.sectionUuid),
      title,
      summary: typeof source.summary === 'string' ? source.summary.trim() : '',
      humanReadableSlug: normalizeHumanReadableSlug(source.humanReadableSlug),
      publicId: normalizeProjectContentItemPublicId(source.publicId),
      isPrivate: source.isPrivate,
      content: {
        contentUuid: normalizeProjectContentItemId(contentSource.contentUuid),
        data,
        ...(typeof contentSource.updatedAt === 'number' ? { updatedAt: contentSource.updatedAt } : {}),
      },
    };
  });
}

export class ProjectContentItemError extends Error {}

function normalizeProjectStage(value: unknown): ProjectStageContentItem {
  if (!value || typeof value !== 'object') throw new ProjectContentItemError('Invalid stage');
  const source = value as Record<string, unknown>;
  const title = typeof source.title === 'string' ? source.title.trim() : '';
  if (!title) throw new ProjectContentItemError('Stage title cannot be empty');
  if (typeof source.isPrivate !== 'boolean') throw new ProjectContentItemError('Invalid stage privacy');
  const contentSource = source.content as Record<string, unknown> | null;
  return {
    isStage: true,
    stageUuid: normalizeProjectContentItemId(source.stageUuid),
    title,
    summary: typeof source.summary === 'string' ? source.summary.trim() : '',
    humanReadableSlug: normalizeHumanReadableSlug(source.humanReadableSlug),
    publicId: normalizeProjectContentItemPublicId(source.publicId),
    isPrivate: source.isPrivate,
    periods: normalizeStagePeriods(source.periods),
    content: contentSource ? {
      contentUuid: normalizeProjectContentItemId(contentSource.contentUuid),
      data: normalizeContentData(contentSource.data),
      ...(typeof contentSource.updatedAt === 'number' ? { updatedAt: contentSource.updatedAt } : {}),
    } : source.content === null ? null : undefined,
  };
}

function normalizeProjectContentItemPublicId(value: unknown) {
  const publicId = normalizePublicId(value);
  if (!publicIdIsValid(publicId))
    throw new ProjectContentItemError('Invalid public ID');
  return publicId;
}
