import { and, eq } from 'drizzle-orm';
import { AssetType, type AssetRole } from '#layers/thei/shared/asset';
import { validateEventData } from '#layers/thei/shared/admin/event';
import type { EventEditData } from '#layers/thei/shared/event';
import type {
  EventGetResponse,
  EventSaveResponse,
} from '#layers/thei/shared/api/event';
import type { OtherAssetGetItem } from '#layers/thei/shared/api/project';
import { DEFAULT_PROJECT_ACTION } from '#layers/thei/shared/project-action';
import { validateEventAssets } from '../../../thei/events/validate-assets';
import {
  prepareContentForSave,
  applyPreparedContentSave,
  deleteContentForOwner,
} from '../../../thei/content/repository';
import {
  applyEventPeriods,
  getEventPeriods,
} from '../../../thei/events/periods';
import {
  prepareEventRelations,
  applyEventRelations,
  getEventRelations,
} from '../../../thei/events/relations';
import {
  prepareEventExternalLinks,
  applyEventExternalLinks,
  getEventExternalLinks,
} from '../../../thei/events/external-links';
import {
  prepareTagUsages,
  applyTagUsages,
  listTagsForContainer,
  deleteTagUsagesForContainer,
} from '../../../thei/tags';
import { syncEntityActionUsages } from '../../../thei/projects/action-usages';
import {
  cleanupOrphanExternalLinks,
  findExternalLink,
} from '../../../thei/external-links/repository';
import {
  archivedOriginalFromMeta,
  buildAdminAssetUrls,
} from '../../../thei/assets/urls';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'eventUuid')!;
  const stored =
    (await THEI_SERVER.events.findByUuid(identifier)) ??
    (await THEI_SERVER.events.findByPublicId(identifier));
  if (!stored)
    throw createError({ statusCode: 404, message: 'Event not found' });
  const eventUuid = stored.eventUuid;

  if (event.method === 'GET') return getEvent(stored);

  if (event.method === 'PUT') {
    const body = await readBody<EventEditData>(event);
    const result = validateEventData(body);
    if (typeof result === 'string')
      return { type: 'error', message: result } satisfies EventSaveResponse;
    if (await THEI_SERVER.events.findByPublicId(result.publicId, eventUuid))
      return {
        type: 'error',
        code: 'public-id-taken',
        message: THEI_SERVER.phrase.public_id_already_taken,
      } satisfies EventSaveResponse;
    const assetError = await validateEventAssets(result);
    if (assetError)
      return { type: 'error', message: assetError } satisfies EventSaveResponse;

    try {
      const [
        contentSave,
        relations,
        externalLinks,
        tags,
        usages,
        currentFiles,
      ] = await Promise.all([
        prepareContentForSave('event', eventUuid, 'event-body', result.content),
        prepareEventRelations(result.relations),
        prepareEventExternalLinks(result.externalLinks),
        prepareTagUsages(result.tags),
        THEI_SERVER.assets.usages.findByContainer('event', eventUuid),
        THEI_SERVER.assets.usages.findOtherForContainer('event', eventUuid),
      ]);
      if (contentSave.type !== 'save')
        return {
          type: 'error',
          message: 'Event content is required',
        } satisfies EventSaveResponse;
      const nextFiles = result.otherAssets ?? [];
      const currentIds = new Set(
        currentFiles.map(({ asset }) => asset.assetUuid),
      );
      const nextIds = new Set(nextFiles.map((file) => file.assetUuid));
      const { db, schema } = THEI_SERVER.useDb();
      const now = Date.now();
      db.transaction((tx) => {
        tx.update(schema.events)
          .set({
            title: result.title,
            summary: result.summary,
            access: result.access,
            humanReadableSlug: result.humanReadableSlug,
            publicId: result.publicId,
            action: result.action,
            updatedAt: now,
          })
          .where(eq(schema.events.eventUuid, eventUuid))
          .run();
        applyEventPeriods(tx, schema, eventUuid, result.periods);
        applyPreparedContentSave(
          tx,
          schema,
          'event',
          eventUuid,
          'event-body',
          contentSave,
        );
        applyEventRelations(tx, schema, eventUuid, relations);
        applyEventExternalLinks(tx, schema, eventUuid, externalLinks);
        applyTagUsages(tx, schema, 'event', eventUuid, tags);
        syncEntityActionUsages(
          tx,
          schema,
          usages,
          'event',
          eventUuid,
          result.action,
        );

        for (const { asset } of currentFiles) {
          if (!nextIds.has(asset.assetUuid))
            detachUsage(tx, schema, asset.assetUuid, eventUuid, 'other-asset');
        }
        nextFiles.forEach((file, order) => {
          if (!currentIds.has(file.assetUuid)) {
            tx.insert(schema.assetUsages)
              .values({
                assetUuid: file.assetUuid,
                containerType: 'event',
                containerId: eventUuid,
                role: 'other-asset',
              })
              .run();
          }
          tx.update(schema.assetUsages)
            .set({
              meta: {
                role: 'other-asset',
                order,
                title: file.title,
                caption: file.caption,
                isPrivate: file.isPrivate,
              },
            })
            .where(usageWhere(schema, file.assetUuid, eventUuid, 'other-asset'))
            .run();
        });
      });
      await cleanupOrphanExternalLinks();
      return {
        type: 'success',
        eventUuid,
        action: result.action,
      } satisfies EventSaveResponse;
    } catch (error) {
      return {
        type: 'error',
        message:
          error instanceof Error ? error.message : 'Failed to save event',
      } satisfies EventSaveResponse;
    }
  }

  if (event.method === 'DELETE') {
    const usages = await THEI_SERVER.assets.usages.findByContainer(
      'event',
      eventUuid,
    );
    const { db, schema } = THEI_SERVER.useDb();
    db.transaction((tx) => {
      tx.delete(schema.stagePeriods)
        .where(
          and(
            eq(schema.stagePeriods.stageType, 'event-stage'),
            eq(schema.stagePeriods.stageUuid, eventUuid),
          ),
        )
        .run();
      tx.delete(schema.eventProjectRelations)
        .where(eq(schema.eventProjectRelations.eventUuid, eventUuid))
        .run();
      tx.delete(schema.eventExternalLinks)
        .where(eq(schema.eventExternalLinks.eventUuid, eventUuid))
        .run();
      deleteTagUsagesForContainer(tx, schema, 'event', eventUuid);
      deleteContentForOwner(tx, schema, 'event', eventUuid);
      usages.forEach((usage) =>
        detachUsage(tx, schema, usage.asset.assetUuid, eventUuid, usage.role),
      );
      tx.delete(schema.events)
        .where(eq(schema.events.eventUuid, eventUuid))
        .run();
    });
    await cleanupOrphanExternalLinks();
    return;
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});

async function getEvent(
  stored: NonNullable<
    Awaited<ReturnType<typeof THEI_SERVER.events.findByUuid>>
  >,
) {
  const eventUuid = stored.eventUuid;
  const usages = await THEI_SERVER.assets.usages.findByContainer(
    'event',
    eventUuid,
  );
  const actionIcon = usages.find((usage) => usage.role === 'action-icon');
  const actionBackground = usages.find(
    (usage) => usage.role === 'action-background',
  );
  const actionFile = usages.find((usage) => usage.role === 'action-file');
  const [
    iconUrls,
    backgroundUrls,
    fileUrls,
    actionLink,
    rawFiles,
    content,
    periods,
    relations,
    externalLinks,
    tags,
  ] = await Promise.all([
    actionIcon ? buildAdminAssetUrls(actionIcon.asset) : undefined,
    actionBackground ? buildAdminAssetUrls(actionBackground.asset) : undefined,
    actionFile ? buildAdminAssetUrls(actionFile.asset) : undefined,
    stored.action?.externalUrl
      ? findExternalLink(stored.action.externalUrl)
      : undefined,
    THEI_SERVER.assets.usages.findOtherForContainer('event', eventUuid),
    THEI_SERVER.content.buildFieldValue('event', eventUuid, 'event-body'),
    getEventPeriods(eventUuid),
    getEventRelations(eventUuid),
    getEventExternalLinks(eventUuid),
    listTagsForContainer('event', eventUuid),
  ]);
  if (!content)
    throw createError({ statusCode: 500, message: 'Event content is missing' });
  const otherAssets: OtherAssetGetItem[] = await Promise.all(
    rawFiles.map(async ({ asset, meta }) => {
      const urls = await buildAdminAssetUrls(asset);
      return {
        assetUuid: asset.assetUuid,
        media: urls.media,
        assetUrl: urls.assetUrl,
        size: asset.size,
        extension: asset.extension,
        archivedOriginal:
          asset.type === AssetType.Other
            ? archivedOriginalFromMeta(asset.meta)
            : undefined,
        title: meta?.role === 'other-asset' ? (meta.title ?? '') : '',
        caption: meta?.role === 'other-asset' ? meta.caption : undefined,
        isPrivate: meta?.role === 'other-asset' ? meta.isPrivate : false,
      };
    }),
  );
  return {
    eventUuid,
    title: stored.title,
    summary: stored.summary,
    access: stored.access,
    humanReadableSlug: stored.humanReadableSlug,
    publicId: stored.publicId,
    periods,
    content,
    otherAssets,
    externalLinks,
    relations,
    tags,
    action: stored.action ?? { ...DEFAULT_PROJECT_ACTION },
    actionIconMedia: iconUrls?.media,
    actionIconAssetSize: actionIcon?.asset.size,
    actionBackgroundMedia: backgroundUrls?.media,
    actionBackgroundAssetSize: actionBackground?.asset.size,
    actionFileUrl: fileUrls?.assetUrl,
    actionFileMedia: fileUrls?.media,
    actionFileExtension: actionFile?.asset.extension,
    actionFileSize: actionFile?.asset.size,
    actionFaviconMedia: actionLink?.faviconMedia,
  } satisfies EventGetResponse;
}

function detachUsage(
  tx: any,
  schema: any,
  assetUuid: string,
  eventUuid: string,
  role: AssetRole,
) {
  tx.delete(schema.assetUsages)
    .where(usageWhere(schema, assetUuid, eventUuid, role))
    .run();
}

function usageWhere(
  schema: any,
  assetUuid: string,
  eventUuid: string,
  role: AssetRole,
) {
  return and(
    eq(schema.assetUsages.assetUuid, assetUuid),
    eq(schema.assetUsages.containerType, 'event'),
    eq(schema.assetUsages.containerId, eventUuid),
    eq(schema.assetUsages.role, role),
  );
}
