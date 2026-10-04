import type {
  PublicNeighbours,
  PublicReferences,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type { Period } from '#layers/thei/shared/period';
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
};

/**
 * When something was made and last changed, as technical dates: the site keeps
 * them by itself, so they tell the history of the page rather than of what it
 * is about. Dated sections, statuses, periods and a diary entry's own day have
 * places of their own.
 *
 * The chronology already leaves `updatedAt` out when the change fell on the
 * day of creation, so an entity edited only that day has a single line.
 */
export function createdAndUpdatedTimelineItems(
  chronology: { createdAt: string; updatedAt?: string },
  labels: { created: string; updated: string },
): PublicDetailTimelineItem[] {
  return [
    ...(chronology.updatedAt
      ? [
          {
            icon: 'history' as const,
            label: labels.updated,
            date: chronology.updatedAt,
          },
        ]
      : []),
    { icon: 'plus', label: labels.created, date: chronology.createdAt },
  ];
}

/** Newest first. Items of one day keep the order they came in. */
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

/** Where a section or a diary entry sits among its own kind. */
export type PublicDetailNeighbours = PublicNeighbours & {
  kind: 'project-section' | 'diary-entry';
};

export type PublicDetailPanelData = {
  contents?: ContentHeading[];
  neighbours?: PublicDetailNeighbours;
  chronology?: PublicDetailTimelineItem[];
  periods?: Period[];
  tags?: PublicTagSummary[];
  references: PublicReferences;
};

/**
 * What the collapsed panel says about itself: how much each of its lists
 * holds, in the order the panel shows them.
 *
 * Only the lists worth opening the panel for are counted. Headings measure the
 * writing rather than the entity, technical dates and a timeline are dates
 * rather than amounts, and tags say little by their number alone. Related
 * entities have a block of their own in the page, so the panel says nothing of
 * them.
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
