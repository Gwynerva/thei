import type {
  PublicProjectReference,
  PublicReferenceGroups,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type { DateRange } from '#layers/thei/shared/date-range';
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

const PROJECT_RELATION_TYPE_ORDER = {
  related: 0,
  influencing: 1,
  dependent: 2,
} as const;

export function sortPublicProjectReferencesByRelationType(
  projects: PublicProjectReference[],
): PublicProjectReference[] {
  return projects
    .map((project, index) => ({ project, index }))
    .sort(
      (left, right) =>
        PROJECT_RELATION_TYPE_ORDER[left.project.relationType ?? 'related'] -
          PROJECT_RELATION_TYPE_ORDER[
            right.project.relationType ?? 'related'
          ] || left.index - right.index,
    )
    .map(({ project }) => project);
}

export type PublicDetailPanelData = {
  contents?: ContentHeading[];
  chronology?: PublicDetailTimelineItem[];
  periods?: DateRange[];
  createdAt?: string;
  tags?: PublicTagSummary[];
  relatedProjects?: PublicProjectReference[];
  references: PublicReferenceGroups;
  metrics?: PublicDetailMetric[];
};
