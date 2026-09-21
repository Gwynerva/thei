import type {
  PublicProjectLink,
  PublicReferences,
  PublicTagSummary,
} from '#layers/thei/shared/api/public';
import type { DateRange } from '#layers/thei/shared/date-range';
import type { IconName } from '#thei/icons';
import type { ContentHeading } from '#layers/thei/app/components/content/content-headings';
import { modalHistorySettled } from '#layers/thei/app/composables/modal';

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

export function sortPublicProjectReferencesByRelationType<
  T extends Pick<PublicProjectLink, 'relationType'>,
>(projects: T[]): T[] {
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
  relatedProjects?: PublicProjectLink[];
  references: PublicReferences;
  metrics?: PublicDetailMetric[];
};

/**
 * Follows contents links from the mobile sheet: the sheet closes first and its
 * history entry is released, then the router takes the hash, so its own scroll
 * handling lands the heading below the sticky bars instead of racing it.
 */
/**
 * Jumping to a heading from the mobile summary.
 *
 * The page is scrolled straight away and the sheet is closed underneath it, in
 * that order: waiting for the closing animation and for history to settle only
 * meant staring at a panel sliding away over a page that had not moved yet. By
 * the time the sheet is gone the page is already where it should be.
 */
export function useSheetContentNavigation() {
  const router = useRouter();
  return async (
    id: string,
    event: MouseEvent,
    close: () => Promise<boolean>,
  ) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView();
    const closed = close();
    const hash = `#${id}`;
    if (router.currentRoute.value.hash !== hash) {
      // The address catches up once the modal has let go of history, which it
      // holds for as long as it is open.
      await closed;
      await modalHistorySettled();
      const { path, query } = router.currentRoute.value;
      await router.replace({ path, query, hash });
    } else await closed;
  };
}
