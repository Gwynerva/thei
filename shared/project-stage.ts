import { normalizeContentData } from './content';
import {
  dateRangeEndTime,
  dateRangeStartTime,
  isDateRangeValue,
  type DateRange,
} from './date-range';
import {
  normalizeProjectStructuredItemId,
  type ProjectStructuredItemBase,
} from './project-structured-item';

export type ProjectStageEditItem = ProjectStructuredItemBase & {
  stageUuid?: string;
  period: DateRange;
};

export type ProjectStageValue = ProjectStageEditItem & { stageUuid: string };

export function normalizeProjectStages(
  value: unknown,
): ProjectStageEditItem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new ProjectStageError('Invalid stages');
  return value
    .map((item) => normalizeProjectStage(item))
    .sort(compareProjectStages);
}

export function compareProjectStages(
  left: ProjectStageEditItem,
  right: ProjectStageEditItem,
) {
  return (
    dateRangeStartTime(left.period.startDate) -
      dateRangeStartTime(right.period.startDate) ||
    dateRangeEndTime(left.period.endDate) -
      dateRangeEndTime(right.period.endDate)
  );
}

export class ProjectStageError extends Error {}

function normalizeProjectStage(value: unknown): ProjectStageEditItem {
  if (!value || typeof value !== 'object')
    throw new ProjectStageError('Invalid stage');
  const source = value as Record<string, unknown>;
  const title = typeof source.title === 'string' ? source.title.trim() : '';
  if (!title) throw new ProjectStageError('Stage title cannot be empty');
  if (typeof source.isPrivate !== 'boolean')
    throw new ProjectStageError('Invalid stage privacy');
  if (!source.period || typeof source.period !== 'object')
    throw new ProjectStageError('Stage period is required');
  const periodSource = source.period as Record<string, unknown>;
  if (
    !isDateRangeValue(periodSource.startDate) ||
    !isDateRangeValue(periodSource.endDate) ||
    dateRangeStartTime(periodSource.startDate) >
      dateRangeEndTime(periodSource.endDate)
  )
    throw new ProjectStageError('Invalid stage period');
  const contentSource = source.content as Record<string, unknown> | null;
  return {
    stageUuid: normalizeProjectStructuredItemId(source.stageUuid),
    title,
    summary: typeof source.summary === 'string' ? source.summary.trim() : '',
    isPrivate: source.isPrivate,
    period: {
      startDate: periodSource.startDate,
      endDate: periodSource.endDate,
    },
    content: contentSource
      ? {
          contentUuid: normalizeProjectStructuredItemId(
            contentSource.contentUuid,
          ),
          data: normalizeContentData(contentSource.data),
        }
      : source.content === null
        ? null
        : undefined,
  };
}
