import { and, eq } from 'drizzle-orm';
import { validatePageData } from '#layers/thei/shared/admin/page';
import type { PageEditData } from '#layers/thei/shared/page';
import type {
  PageGetResponse,
  PageSaveResponse,
} from '#layers/thei/shared/api/page';
import { buildAdminAssetUrls } from '../../../thei/assets/urls';
import {
  applyPreparedContentSave,
  prepareContentForSave,
} from '../../../thei/content/repository';
import { validatePageAssets } from '../../../thei/pages/validate-assets';
import { deletePage } from '../../../thei/pages/delete';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'pageUuid') ?? '';
  const stored =
    (await THEI_SERVER.pages.findByUuid(identifier)) ??
    (await THEI_SERVER.pages.findBySlug(identifier));
  if (!stored)
    throw createError({ statusCode: 404, message: 'Page not found' });
  const pageUuid = stored.pageUuid;

  if (event.method === 'GET') {
    const usages = await THEI_SERVER.assets.usages.findByContainer(
      'page',
      pageUuid,
    );
    const icon = usages.find((usage) => usage.role === 'icon');
    const content = await THEI_SERVER.content.buildFieldValue(
      'page',
      pageUuid,
      'page-body',
    );
    if (!content)
      throw createError({
        statusCode: 500,
        message: 'Page content is missing',
      });
    return {
      pageUuid,
      title: stored.title,
      summary: stored.summary,
      slug: stored.slug,
      access: stored.access,
      iconAssetUuid: icon?.asset.assetUuid,
      iconMedia: icon
        ? (await buildAdminAssetUrls(icon.asset)).media!
        : undefined,
      iconAssetSize: icon?.asset.size,
      content,
    } satisfies PageGetResponse;
  }

  if (event.method === 'PUT') {
    const result = validatePageData(await readBody<PageEditData>(event));
    if (typeof result === 'string')
      return { type: 'error', message: result } satisfies PageSaveResponse;
    if (await THEI_SERVER.pages.findBySlug(result.slug, pageUuid))
      return slugTaken();
    const assetError = await validatePageAssets(result);
    if (assetError)
      return { type: 'error', message: assetError } satisfies PageSaveResponse;
    const prepared = await prepareContentForSave(
      'page',
      pageUuid,
      'page-body',
      result.content,
    );
    if (prepared.type !== 'save')
      return {
        type: 'error',
        message: 'Page content is required',
      } satisfies PageSaveResponse;
    const usages = await THEI_SERVER.assets.usages.findByContainer(
      'page',
      pageUuid,
    );
    const currentIcon = usages.find((usage) => usage.role === 'icon');
    const { db, schema } = THEI_SERVER.useDb();
    const now = Date.now();
    try {
      db.transaction((tx) => {
        tx.update(schema.pages)
          .set({
            title: result.title,
            summary: result.summary,
            slug: result.slug,
            access: result.access,
            updatedAt: now,
          })
          .where(eq(schema.pages.pageUuid, pageUuid))
          .run();
        applyPreparedContentSave(
          tx,
          schema,
          'page',
          pageUuid,
          'page-body',
          prepared,
        );
        if (currentIcon?.asset.assetUuid !== result.iconAssetUuid) {
          if (currentIcon) {
            tx.delete(schema.assetUsages)
              .where(
                and(
                  eq(schema.assetUsages.assetUuid, currentIcon.asset.assetUuid),
                  eq(schema.assetUsages.containerType, 'page'),
                  eq(schema.assetUsages.containerId, pageUuid),
                  eq(schema.assetUsages.role, 'icon'),
                ),
              )
              .run();
          }
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
        }
      });
      return { type: 'success', pageUuid, slug: result.slug };
    } catch (error) {
      if (isSlugConstraint(error)) return slugTaken();
      return {
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to save page',
      } satisfies PageSaveResponse;
    }
  }

  if (event.method === 'DELETE') {
    deletePage(pageUuid);
    return;
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
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
