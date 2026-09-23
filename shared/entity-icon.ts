import type { ContentEntityType } from './content-link';

/**
 * The icon that stands for a kind of entity, wherever one is named: a link
 * block, an inline link, the corner of a sidebar tile, a picker result.
 *
 * One table, because every place that names a kind would otherwise keep a
 * list of its own, and those lists drift apart the first time a kind is added.
 */
const ENTITY_TYPE_ICONS = {
  project: 'project',
  'project-stage': 'calendar',
  'project-section': 'file-tray-stack',
  event: 'event',
  'diary-entry': 'thought',
  page: 'page',
} as const satisfies Record<ContentEntityType, string>;

export function entityTypeIcon<T extends ContentEntityType>(
  type: T,
): (typeof ENTITY_TYPE_ICONS)[T] {
  return ENTITY_TYPE_ICONS[type];
}
