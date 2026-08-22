import { and, eq } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import type { ContentAssetUsageMeta } from '#layers/thei/shared/asset';
import { publicIdFromEventUrlPart } from '#layers/thei/shared/event-url';
import { sendAssetFile } from '../../../../thei/assets/send-file';

export default defineEventHandler(async (event) => {
  const urlPart = getRouterParam(event, 'slug') ?? '';
  const filename = getRouterParam(event, 'filename') ?? '';
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) throw createError({ statusCode: 404 });
  const assetSlug = filename.slice(0, dot);
  const extension = filename.slice(dot + 1).toLowerCase();

  const stored = await THEI_SERVER.events.findByPublicId(
    publicIdFromEventUrlPart(urlPart),
  );
  if (!stored) throw createError({ statusCode: 404 });
  const isAdmin = await THEI_SERVER.isAdmin(event);
  if (stored.access === ProjectEventAccessLevel.Private && !isAdmin)
    throw createError({ statusCode: 404 });

  const asset = await THEI_SERVER.assets.findBySlug(assetSlug);
  if (!asset || asset.extension !== extension)
    throw createError({ statusCode: 404 });

  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select({ contentUuid: schema.content.contentUuid })
    .from(schema.content)
    .where(
      and(
        eq(schema.content.ownerType, 'event'),
        eq(schema.content.ownerId, stored.eventUuid),
        eq(schema.content.slot, 'event-body'),
      ),
    )
    .get();
  if (!row) throw createError({ statusCode: 404 });
  const usage = await THEI_SERVER.assets.usages.findOne(
    asset.assetUuid,
    'content',
    row.contentUuid,
    'content',
  );
  if (!usage) throw createError({ statusCode: 404 });
  const meta = usage.meta as ContentAssetUsageMeta | null;
  const hasPublicReference =
    meta?.role === 'content' &&
    meta.refs.some((reference) => !reference.isPrivate);
  if (!isAdmin && !hasPublicReference) throw createError({ statusCode: 404 });

  const filePath = THEI_SERVER.assets.filePath(
    asset.assetUuid,
    asset.extension,
  );
  return sendAssetFile(event, filePath, asset.extension, {
    cacheControl:
      stored.access === ProjectEventAccessLevel.Private
        ? 'private, no-cache'
        : 'public, max-age=31536000, immutable',
    filename,
  });
});
