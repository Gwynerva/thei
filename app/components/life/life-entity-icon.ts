import type { LifeEntityKind } from '#layers/thei/shared/life';
import type { IconName } from '#thei/icons';
import { isContentEntityType } from '#layers/thei/shared/content-link';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';

/**
 * The icon that stands for a kind of timeline point.
 *
 * Entities take the icon every other place names them with; only the points
 * that are not entities — an avatar, a status — are drawn from here.
 */
const LIFE_ENTITY_ICONS: Partial<Record<LifeEntityKind, IconName>> = {
  'profile-avatar': 'person',
  'profile-status': 'pulse',
};

export function lifeEntityKindIcon(kind: LifeEntityKind): IconName {
  return isContentEntityType(kind)
    ? entityTypeIcon(kind)
    : (LIFE_ENTITY_ICONS[kind] ?? 'project');
}
