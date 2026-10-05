import type { TabItem } from '#layers/thei/app/components/UnderlineTabs.vue';
import {
  RELATION_ENTITY_TYPES,
  type RelationEntityType,
} from '#layers/thei/shared/relation';
import { relationEntityIcon } from '#layers/thei/shared/relation-display';

/** The two ways a project's sections are read. */
export type SectionGroup = 'undated' | 'dated';

/**
 * The tabs heading a project's sections, on its page and in its editor:
 * the general sections, then the dated stages, each with how many it holds.
 */
export function sectionGroupTabs(
  counts: Record<SectionGroup, number>,
): TabItem<SectionGroup>[] {
  return [
    {
      key: 'undated',
      label: phrase.value.project_sections_undated,
      icon: 'text',
      count: counts.undated,
    },
    {
      key: 'dated',
      label: phrase.value.project_sections_dated,
      icon: 'calendar',
      count: counts.dated,
    },
  ];
}

/**
 * The tabs heading a block of relations, on a public page and in a form:
 * one for each kind of entity, in their order, with how many it holds.
 */
export function relationKindTabs(
  counts: Partial<Record<RelationEntityType, number>>,
): TabItem<RelationEntityType>[] {
  const labels: Record<RelationEntityType, string> = {
    project: phrase.value.projects,
    event: phrase.value.events,
    'diary-entry': phrase.value.diary,
  };
  return RELATION_ENTITY_TYPES.map((type) => ({
    key: type,
    label: labels[type],
    icon: relationEntityIcon(type),
    count: counts[type],
  }));
}
