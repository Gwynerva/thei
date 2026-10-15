import { and, eq } from 'drizzle-orm';
import { validatePageData } from '#layers/thei/shared/admin/page';
import type { PageEditData } from '#layers/thei/shared/page';
import type {
  PageGetResponse,
  PageSaveResponse,
} from '#layers/thei/shared/api/page';
import { buildAdminAssetUrls } from '../assets/urls';
import {
  applyPreparedContentSave,
  prepareContentForSave,
} from '../content/repository';
import { validatePageAssets } from './validate-assets';
import { deletePage } from './delete';

import {
  assertEntityVersion,
  EntityEditConflict,
  type EntityEditOptions,
  storedVersion,
} from '../entity-edit';
import { deleteUsagesReleasing } from '../assets/repository/usages/release';

/**
 * A page as its edit form reads and saves it — the admin form, and an AI client that reads the same form, changes what it was asked to and saves it back. Saving is a whole replace: whatever the form leaves out is cleared.
 */

/** The edit form, everything in it. */
export async function readPageEdit(
  stored: NonNullable<Awaited<ReturnType<typeof THEI_SERVER.pages.findByUuid>>>,
) {
  const pageUuid = stored.pageUuid;
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
    version: stored.updatedAt,
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
    reminder: stored.reminder,
    notes: await THEI_SERVER.content.buildFieldValue(
      'page',
      pageUuid,
      'page-notes',
    ),
  } satisfies PageGetResponse;
}

/** Saves the edit form over what it edits, or says what is wrong. */
export async function savePageEdit(
  stored: NonNullable<Awaited<ReturnType<typeof THEI_SERVER.pages.findByUuid>>>,
  body: PageEditData,
  options: EntityEditOptions = {},
): Promise<PageSaveResponse> {
  const pageUuid = stored.pageUuid;
  const result = validatePageData(body);
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
  const preparedNotes = await prepareContentForSave(
    'page',
    pageUuid,
    'page-notes',
    result.notes,
  );
  const usages = await THEI_SERVER.assets.usages.findByContainer(
    'page',
    pageUuid,
  );
  const currentIcon = usages.find((usage) => usage.role === 'icon');
  const { db, schema } = THEI_SERVER.useDb();
  const now = Date.now();
  try {
    db.transaction((tx) => {
      assertEntityVersion(
        tx,
        schema.pages,
        schema.pages.pageUuid,
        pageUuid,
        options.expectedUpdatedAt,
      );
      if (result.access !== 'public')
        tx.delete(schema.profilePinnedPages)
          .where(eq(schema.profilePinnedPages.pageUuid, pageUuid))
          .run();
      tx.update(schema.pages)
        .set({
          title: result.title,
          summary: result.summary,
          slug: result.slug,
          access: result.access,
          reminder: result.reminder,
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
      applyPreparedContentSave(
        tx,
        schema,
        'page',
        pageUuid,
        'page-notes',
        preparedNotes,
      );
      if (currentIcon?.asset.assetUuid !== result.iconAssetUuid) {
        if (currentIcon) {
          deleteUsagesReleasing(
            tx,
            schema,
            and(
              eq(schema.assetUsages.assetUuid, currentIcon.asset.assetUuid),
              eq(schema.assetUsages.containerType, 'page'),
              eq(schema.assetUsages.containerId, pageUuid),
              eq(schema.assetUsages.role, 'icon'),
            ),
          );
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
      options.onWrite?.(tx, schema);
    });
    return {
      type: 'success',
      pageUuid,
      version: storedVersion('page', pageUuid),
      slug: result.slug,
    };
  } catch (error) {
    if (error instanceof EntityEditConflict)
      return {
        type: 'error',
        code: 'changed',
        message: error.message,
      } satisfies PageSaveResponse;
    if (isSlugConstraint(error)) return slugTaken();
    return {
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to save page',
    } satisfies PageSaveResponse;
  }
}

/** Deletes it with everything that is its own. */
export async function deletePageEdit(
  stored: NonNullable<Awaited<ReturnType<typeof THEI_SERVER.pages.findByUuid>>>,
  options: Pick<EntityEditOptions, 'onWrite' | 'beforeWrite'> = {},
) {
  const pageUuid = stored.pageUuid;
  deletePage(pageUuid, options);
  return;
}

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
