import { eq } from 'drizzle-orm';
import { validatePageData } from '#layers/thei/shared/admin/page';
import type { PageEditData } from '#layers/thei/shared/page';
import type { PageSaveResponse } from '#layers/thei/shared/api/page';
import { EntityPrefix, generateUniqueId } from '../../../thei/entity-id';
import {
  applyPreparedContentSave,
  prepareContentForSave,
} from '../../../thei/content/repository';
import { validatePageAssets } from '../../../thei/pages/validate-assets';

export default defineEventHandler(async (event): Promise<PageSaveResponse> => {
  const result = validatePageData(await readBody<PageEditData>(event));
  if (typeof result === 'string') return { type: 'error', message: result };
  if (await THEI_SERVER.pages.findBySlug(result.slug)) return slugTaken();
  const assetError = await validatePageAssets(result);
  if (assetError) return { type: 'error', message: assetError };
  const pageUuid = await generateUniqueId(
    EntityPrefix.Page,
    async (id) => !(await THEI_SERVER.pages.findByUuid(id)),
  );
  const prepared = await prepareContentForSave(
    'page',
    pageUuid,
    'page-body',
    result.content,
  );
  if (prepared.type !== 'save')
    return { type: 'error', message: 'Page content is required' };
  const { db, schema } = THEI_SERVER.useDb();
  const now = Date.now();
  try {
    db.transaction((tx) => {
      tx.insert(schema.pages)
        .values({
          pageUuid,
          title: result.title,
          summary: result.summary,
          slug: result.slug,
          access: result.access,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      applyPreparedContentSave(
        tx,
        schema,
        'page',
        pageUuid,
        'page-body',
        prepared,
      );
      if (result.iconAssetUuid) {
        tx.insert(schema.assetUsages)
          .values({
            assetUuid: result.iconAssetUuid,
            containerType: 'page',
            containerId: pageUuid,
            role: 'icon',
          })
          .run();
        tx.update(schema.assets)
          .set({ touchedAt: now })
          .where(eq(schema.assets.assetUuid, result.iconAssetUuid))
          .run();
      }
    });
    return { type: 'success', pageUuid, slug: result.slug };
  } catch (error) {
    if (isSlugConstraint(error)) return slugTaken();
    return {
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to create page',
    };
  }
});

function slugTaken(): PageSaveResponse {
  return {
    type: 'error',
    code: 'slug-taken',
    message: THEI_SERVER.phrase.page_slug_already_taken,
  };
}

function isSlugConstraint(error: unknown) {
  const code = String((error as { code?: unknown })?.code ?? '');
  const message = String((error as { message?: unknown })?.message ?? '');
  return (
    code === 'SQLITE_CONSTRAINT_UNIQUE' &&
    (message.includes('pages.slug') || message.includes('pages_slug_unique'))
  );
}
