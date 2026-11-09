import type {
  AdminExcerptAbout,
  AdminExcerptsAboutResponse,
} from '#layers/thei/shared/api/excerpt';
import type { ContentEntitySearchItem } from '#layers/thei/shared/admin/content-entity-search';
import { buildExcerptAdminPath } from '#layers/thei/shared/excerpt-url';
import { isRelationTargetType } from '#layers/thei/shared/relation';
import { OWNER } from '../../../thei/access-links/viewer';
import { findContentEntity } from '../../../thei/content-entities';
import { contentEntitySearchItem } from '../../../thei/content-entity-search';
import { excerptRelationRowsOf, findExcerpt } from '../../../thei/excerpts';
import { relationIconMedia } from '../../../thei/relations';

/**
 * The excerpts about an entity, for its form: the read-only tab of its
 * relations block, the recommendation to relate their parents, and the
 * question its deletion asks. `type` and `id` name the entity.
 */
export default defineEventHandler(
  async (event): Promise<AdminExcerptsAboutResponse> => {
    const { type, id } = getQuery(event);
    if (!isRelationTargetType(type) || typeof id !== 'string' || !id)
      throw createError({ statusCode: 400, message: 'Invalid entity' });
    const { db, schema } = THEI_SERVER.useDb();
    const target = { type, id };
    const ids = [
      ...new Set(
        excerptRelationRowsOf(db, schema, target).map(
          (item) => item.excerptUuid,
        ),
      ),
    ];
    const parents = new Map<string, ContentEntitySearchItem | undefined>();
    const items: AdminExcerptAbout[] = [];
    for (const excerptUuid of ids) {
      const excerpt = findExcerpt(excerptUuid);
      if (!excerpt) continue;
      const key = `${excerpt.parentType}:${excerpt.parentId}`;
      if (!parents.has(key)) {
        const record = await findContentEntity(
          { entityType: excerpt.parentType, entityId: excerpt.parentId },
          OWNER,
        );
        parents.set(key, record && (await contentEntitySearchItem(record)));
      }
      const parent = parents.get(key);
      if (!parent) continue;
      items.push({
        excerptUuid,
        title: excerpt.title,
        publicId: excerpt.publicId,
        isPrivate: excerpt.isPrivate,
        media: await relationIconMedia({ type: 'excerpt', id: excerptUuid }),
        parent,
        editPath: buildExcerptAdminPath(
          excerpt.parentType,
          excerpt.parentId,
          excerpt.publicId,
        ),
      });
    }
    return { items };
  },
);
