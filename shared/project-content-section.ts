import {
  ContentValidationError,
  normalizeContentData,
  type ContentFieldModelValue,
} from './content';
import {
  dateRangeEndTime,
  dateRangeStartTime,
  isDateOnlyRange,
  isDateRangeValue,
  toDateString,
  type DateRange,
} from './date-range';

export type ProjectContentSectionPeriod = DateRange;

export type ProjectContentSectionEditItem = {
  sectionUuid?: string;
  title: string;
  summary: string;
  isPrivate: boolean;
  periods: ProjectContentSectionPeriod[];
  content?: ContentFieldModelValue | null;
};

export type ProjectContentSectionValue = ProjectContentSectionEditItem & {
  sectionUuid: string;
};

export function normalizeProjectContentSectionPeriods(
  value: unknown,
): ProjectContentSectionPeriod[] {
  if (!Array.isArray(value))
    throw new ProjectContentSectionError('Invalid section periods');
  const periods = value
    .map((item) => {
      if (!item || typeof item !== 'object')
        throw new ProjectContentSectionError('Invalid section period');
      const { startDate, endDate } = item as Record<string, unknown>;
      if (!isDateRangeValue(startDate) || !isDateRangeValue(endDate)) {
        throw new ProjectContentSectionError('Invalid section period');
      }
      if (dateRangeStartTime(startDate) > dateRangeEndTime(endDate)) {
        throw new ProjectContentSectionError('Invalid section period');
      }
      return { startDate, endDate };
    })
    .sort(
      (a, b) =>
        dateRangeStartTime(a.startDate) - dateRangeStartTime(b.startDate),
    );

  const dateOnlyPeriods = periods.filter(isDateOnlyRange);
  const precisePeriods = periods.filter((period) => !isDateOnlyRange(period));
  const normalizedDateOnlyPeriods = dateOnlyPeriods.reduce<
    ProjectContentSectionPeriod[]
  >((result, period) => {
    const previous = result.at(-1);
    if (!previous || !dateOnlyPeriodsTouchOrOverlap(previous, period)) {
      result.push(period);
      return result;
    }
    if (period.endDate > previous.endDate) previous.endDate = period.endDate;
    return result;
  }, []);

  return [...normalizedDateOnlyPeriods, ...precisePeriods].sort(
    (a, b) => dateRangeStartTime(a.startDate) - dateRangeStartTime(b.startDate),
  );
}

export function normalizeProjectContentSections(
  value: unknown,
): ProjectContentSectionEditItem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value))
    throw new ProjectContentSectionError('Invalid content sections');
  return value.map((item) => {
    if (!item || typeof item !== 'object')
      throw new ProjectContentSectionError('Invalid content section');
    const source = item as Record<string, unknown>;
    const title = typeof source.title === 'string' ? source.title.trim() : '';
    if (!title)
      throw new ProjectContentSectionError(
        'Content section title cannot be empty',
      );
    if (typeof source.isPrivate !== 'boolean')
      throw new ProjectContentSectionError('Invalid content section privacy');
    const summary =
      typeof source.summary === 'string' ? source.summary.trim() : '';
    const sectionUuid =
      typeof source.sectionUuid === 'string' && source.sectionUuid
        ? source.sectionUuid
        : undefined;
    const content =
      source.content === undefined
        ? undefined
        : source.content === null
          ? null
          : {
              contentUuid:
                typeof (source.content as any).contentUuid === 'string'
                  ? (source.content as any).contentUuid
                  : undefined,
              data: normalizeContentData((source.content as any).data),
            };
    return {
      sectionUuid,
      title,
      summary,
      isPrivate: source.isPrivate,
      periods: normalizeProjectContentSectionPeriods(source.periods),
      content,
    };
  });
}

export class ProjectContentSectionError extends Error {}

function dateOnlyPeriodsTouchOrOverlap(
  previous: ProjectContentSectionPeriod,
  period: ProjectContentSectionPeriod,
) {
  const nextDay = new Date(`${previous.endDate}T00:00:00`);
  nextDay.setDate(nextDay.getDate() + 1);
  return period.startDate <= toDateString(nextDay);
}
