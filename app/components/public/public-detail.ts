import type {
  PublicNeighbours,
  PublicReferences,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type { DateRange } from '#layers/thei/shared/date-range';
import { publicReferenceSplitSize } from '#layers/thei/shared/public-references';
import type { IconName } from '#thei/icons';
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';

export type PublicDetailMetric = {
  icon: IconName;
  label: string;
  value: string | number;
};

export type PublicDetailTimelineItem = {
  icon: IconName;
  label: string;
  date: string;
  /** Where the date comes from or leads, when that is a page of its own. */
  href?: string;
};

/**
 * When something was made and last changed, as key dates.
 *
 * The chronology already leaves `updatedAt` out when the change fell on the
 * day of creation, so an entity edited only that day has a single line.
 */
export function createdAndUpdatedTimelineItems(
  chronology: { createdAt: string; updatedAt?: string },
  labels: { created: string; updated: string },
): PublicDetailTimelineItem[] {
  return [
    { icon: 'plus', label: labels.created, date: chronology.createdAt },
    ...(chronology.updatedAt
      ? [
          {
            icon: 'history' as const,
            label: labels.updated,
            date: chronology.updatedAt,
          },
        ]
      : []),
  ];
}

/**
 * The first and the last of something, as key dates.
 *
 * When there is only one — one stage, one status — or when both land on the
 * same day and the same page, "first" and "last" would name the same thing
 * twice, so it collapses into a single line under the plain name instead.
 */
export function firstAndLastTimelineItems<T>(
  items: readonly T[],
  pick: (item: T) => { date: string; href?: string } | undefined,
  labels: { icon: IconName; first: string; last: string; only: string },
): PublicDetailTimelineItem[] {
  const marks = items
    .map(pick)
    .filter((mark): mark is { date: string; href?: string } => Boolean(mark))
    .sort((left, right) => left.date.localeCompare(right.date));
  const first = marks.at(0);
  const last = marks.at(-1);
  if (!first || !last) return [];
  if (
    marks.length === 1 ||
    (first.date === last.date && first.href === last.href)
  )
    return [{ icon: labels.icon, label: labels.only, ...last }];
  return [
    { icon: labels.icon, label: labels.first, ...first },
    { icon: labels.icon, label: labels.last, ...last },
  ];
}

/**
 * A diary entry's key dates: its day, when it was written, when it last changed.
 *
 * Most entries are written on the day they are about, and then "created" on
 * that very day already says what the entry is about, so the two are one line.
 * An edit is never folded in the same way: it is incidental, says nothing about
 * what the entry is about, and would move off the day with the next edit.
 * Writing and editing on the same day are already one date in the chronology.
 *
 * Listed newest first by the timeline, with an edit on the entry's own day
 * kept above the day, where an edit sits everywhere else.
 */
export function diaryTimelineItems(
  entry: {
    date: string;
    chronology: { createdAt: string; updatedAt?: string };
    /** Where the day leads, such as the day in the life timeline. */
    href?: string;
  },
  labels: { day: string; created: string; updated: string },
): PublicDetailTimelineItem[] {
  const { date, href } = entry;
  const { createdAt, updatedAt } = entry.chronology;
  const created = { icon: 'plus' as const, label: labels.created };
  const day = {
    ...(createdAt === date
      ? created
      : { icon: 'thought' as const, label: labels.day }),
    date,
    ...(href ? { href } : {}),
  };
  return [
    ...(updatedAt && updatedAt !== createdAt
      ? [{ icon: 'history' as const, label: labels.updated, date: updatedAt }]
      : []),
    day,
    ...(createdAt !== date ? [{ ...created, date: createdAt }] : []),
  ];
}

export function sortPublicDetailTimelineItems(
  items: PublicDetailTimelineItem[],
): PublicDetailTimelineItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        right.item.date.localeCompare(left.item.date) ||
        left.index - right.index,
    )
    .map(({ item }) => item);
}

/** Where a stage, section or diary entry sits among its own kind. */
export type PublicDetailNeighbours = PublicNeighbours & {
  kind: 'project-stage' | 'project-section' | 'diary-entry';
};

export type PublicDetailPanelData = {
  contents?: ContentHeading[];
  neighbours?: PublicDetailNeighbours;
  chronology?: PublicDetailTimelineItem[];
  periods?: DateRange[];
  tags?: PublicTagSummary[];
  references: PublicReferences;
};

/**
 * What the collapsed panel says about itself: how much each of its lists
 * holds, in the order the panel shows them.
 *
 * Only the lists worth opening the panel for are counted. Headings measure the
 * writing rather than the entity, key dates and a timeline are dates rather
 * than amounts, and tags say little by their number alone. Related entities
 * have a block of their own in the page, so the panel says nothing of them.
 */
export function publicDetailSummary(
  data: PublicDetailPanelData,
  labels: { links: string; files: string },
): PublicDetailMetric[] {
  const metrics: PublicDetailMetric[] = [
    {
      icon: 'link',
      label: labels.links,
      value: publicReferenceSplitSize(data.references.links),
    },
    {
      icon: 'files',
      label: labels.files,
      value: publicReferenceSplitSize(data.references.files),
    },
  ];
  return metrics.filter((metric) => Number(metric.value) > 0);
}
