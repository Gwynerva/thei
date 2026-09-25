import type { H3Event } from 'h3';
import type {
  PublicEntityLink,
  PublicRelatedCounts,
  PublicRelatedPage,
} from '#layers/thei/shared/api/public';
import {
  isRelationEntityType,
  RELATION_ENTITY_TYPES,
  relationEndpointKey,
  type RelationEndpoint,
  type RelationEntityType,
  type RelationType,
} from '#layers/thei/shared/relation';
import { RELATION_GROUP_ORDER } from '#layers/thei/shared/relation-display';
import { findContentEntity } from '../content-entities';
import {
  loadRelationTargets,
  readRelationRows,
  type RelationTarget,
} from '../relations';
import { canListPublicEntity, paginatePublic } from './entities';
import { buildSecretReference } from './secret';

/** How many related entities one page of the block holds. */
export const PUBLIC_RELATED_PAGE_SIZE = 24;

/**
 * One relation as a visitor may see it, before its tile is built.
 *
 * Cheap on purpose: a project may gather hundreds of diary entries, and the
 * page only needs to count them and show one page at a time.
 */
export type PublicRelatedItem = {
  endpoint: RelationEndpoint;
  relationType: RelationType;
  /** Why this is related, as written for the side being shown. */
  note?: string;
  target: RelationTarget;
  /** The visitor may not open the other end, only learn that it exists. */
  secret: boolean;
  /** The owner's own position for it, which orders projects and events. */
  order: number;
};

/**
 * Everything related to an entity, as this visitor may see it, in the order
 * the page lists it.
 *
 * A project or an event the visitor may not list becomes a codename rather
 * than vanishing: the relation itself is not a secret, only what is on the
 * other end. A diary entry the visitor cannot open is simply absent. A page
 * saying "and three more you may not read" would leak how much was written
 * about it, which is exactly what a private entry is protecting.
 *
 * The order is the directed kinds first, then plain "related"; inside a kind,
 * projects and events keep the order the owner gave them and diary entries
 * run newest first, because their days already order them.
 */
export async function resolvePublicRelated(
  owner: RelationEndpoint,
  isAdmin: boolean,
): Promise<PublicRelatedItem[]> {
  const rows = readRelationRows(owner);
  const targets = await loadRelationTargets(rows.map((row) => row.other));
  const items: PublicRelatedItem[] = [];
  for (const row of rows) {
    const target = targets.get(relationEndpointKey(row.other));
    if (!target) continue;
    const listable = canListPublicEntity(target.access, isAdmin);
    if (!listable && target.type === 'diary-entry') continue;
    const note =
      row.note?.type === 'split' ? row.note.currentText : row.note?.text;
    items.push({
      endpoint: row.other,
      relationType: row.type,
      ...(note ? { note } : {}),
      target,
      secret: !listable,
      order: row.order,
    });
  }
  return items.sort(compareRelated);
}

function compareRelated(left: PublicRelatedItem, right: PublicRelatedItem) {
  const byGroup =
    RELATION_GROUP_ORDER.indexOf(left.relationType) -
    RELATION_GROUP_ORDER.indexOf(right.relationType);
  if (byGroup) return byGroup;
  const byKind =
    RELATION_ENTITY_TYPES.indexOf(left.endpoint.type) -
    RELATION_ENTITY_TYPES.indexOf(right.endpoint.type);
  if (byKind) return byKind;
  if (left.endpoint.type === 'diary-entry')
    return (right.target.date ?? '').localeCompare(left.target.date ?? '');
  return left.order - right.order;
}

/** How many of each kind the visitor may see: what the tabs are labelled with. */
export function countPublicRelated(
  items: PublicRelatedItem[],
): PublicRelatedCounts {
  const counts: PublicRelatedCounts = {};
  for (const item of items)
    counts[item.endpoint.type] = (counts[item.endpoint.type] ?? 0) + 1;
  return counts;
}

/**
 * The tiles for a set of related items, as this reader may see them.
 *
 * Pictures come through `findContentEntity` with the visitor's view, from
 * public addresses. A diary entry is titled by its day and described by its
 * opening line, since it has neither a title nor a summary of its own.
 */
export async function buildPublicRelatedLinks(
  items: PublicRelatedItem[],
  isAdmin: boolean,
): Promise<PublicEntityLink[]> {
  const links = await Promise.all(
    items.map(async (item): Promise<PublicEntityLink | undefined> => {
      const entityType = item.endpoint.type;
      const entityId = item.endpoint.id;
      if (item.secret)
        return {
          ...buildSecretReference(entityType, entityId),
          relationType: item.relationType,
          entityType,
        };
      const entity = await findContentEntity({ entityType, entityId }, isAdmin);
      if (!entity) return undefined;
      return {
        entityType,
        title: entity.title,
        summary: entity.summary,
        href: entity.href,
        iconMedia: await entity.media('public', isAdmin),
        relationType: item.relationType,
        ...(entity.date ? { date: entity.date } : {}),
        ...(item.note ? { note: item.note } : {}),
      };
    }),
  );
  return links.filter((link) => link !== undefined);
}

/** One page of one kind, for the tab that shows it. */
export async function buildPublicRelatedPage(
  owner: RelationEndpoint,
  kind: RelationEntityType,
  page: unknown,
  isAdmin: boolean,
): Promise<PublicRelatedPage> {
  const items = (await resolvePublicRelated(owner, isAdmin)).filter(
    (item) => item.endpoint.type === kind,
  );
  const paged = paginatePublic(items, page, PUBLIC_RELATED_PAGE_SIZE);
  return {
    ...paged,
    items: await buildPublicRelatedLinks(paged.items, isAdmin),
  };
}

/** Every related entity of every kind at once, for the Markdown mirror. */
export async function listPublicRelatedAll(
  owner: RelationEndpoint,
  isAdmin: boolean,
): Promise<PublicEntityLink[]> {
  return buildPublicRelatedLinks(
    await resolvePublicRelated(owner, isAdmin),
    isAdmin,
  );
}

/** The `kind` and `page` a related-entities route is asked for. */
export function readPublicRelatedQuery(event: H3Event): {
  kind: RelationEntityType;
  page: unknown;
} {
  const { kind, page } = getQuery(event);
  if (!isRelationEntityType(kind))
    throw createError({ statusCode: 400, message: 'Invalid entity kind' });
  return { kind, page };
}
