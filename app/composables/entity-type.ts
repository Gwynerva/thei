import type {
  ContentEntityParent,
  ContentEntityType,
} from '#layers/thei/shared/content-link';
import { entityTypeIcon } from '#layers/thei/shared/entity-icon';
import { formatEntityPlaceName } from '#layers/thei/shared/entity-place-name';
import type { IconName } from '#thei/icons';

/**
 * What an entity belongs to, as the first line of its card says it
 * (`EntityLinkPreviewCard`): the glyph of the parent's kind and its name — a
 * diary entry's day written out.
 */
export function entityParentLine(
  parent: Pick<ContentEntityParent, 'type' | 'title' | 'date'>,
): { icon: IconName; label: string } {
  return {
    icon: entityTypeIcon(parent.type),
    label: entityListName(parent),
  };
}

/** What a kind of entity is called, for a tooltip or a badge. */
export function entityTypeLabel(type: ContentEntityType): string {
  const value = phrase.value;
  return {
    project: value.project,
    'project-section': value.content_section,
    event: value.event,
    'diary-entry': value.diary_entry,
    excerpt: value.excerpt,
    page: value.page,
    tag: value.tag,
  }[type];
}

/**
 * The name to show for a linked entity. A diary entry has no title and is
 * called by its day, so its `date` is written out as one — with its month
 * abbreviated (`abbreviated`) where the name has the room of a chip.
 */
export function entityDisplayTitle(
  entity: {
    title: string;
    date?: string;
  },
  style: 'long' | 'abbreviated' = 'long',
): string {
  return entity.date
    ? formatAbsolutePublicDate(entity.date, language.value.code, style)
    : entity.title;
}

/**
 * What an entity is called where it is listed — a relation, a neighbour:
 * a diary entry by its day, anything else by its title, formatted as the
 * owner's words are, or by its id while it has none.
 */
export function entityListName(
  entity: { title?: string; date?: string; entityId?: string },
  style: 'long' | 'abbreviated' = 'long',
): string {
  if (entity.date)
    return formatAbsolutePublicDate(entity.date, language.value.code, style);
  return entity.title ? publicText(entity.title) : (entity.entityId ?? '');
}

/**
 * A name put together of several — «what holds it · itself», «an entity ›
 * a heading in it» — as a reader names it: each part that is a diary
 * entry's day is written out, the others formatted as the owner's words are.
 * For a name that comes as one string; one that comes with its `date` is
 * `entityListName`'s.
 */
export function entityPlaceName(name: string): string {
  return formatEntityPlaceName(
    name,
    (day) => formatAbsolutePublicDate(day, language.value.code),
    publicText,
  );
}
