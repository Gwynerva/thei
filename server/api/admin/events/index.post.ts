import { and, eq } from 'drizzle-orm';
import { validateEventData } from '#layers/thei/shared/admin/event';
import type { EventEditData } from '#layers/thei/shared/event';
import type { EventSaveResponse } from '#layers/thei/shared/api/event';
import { EntityPrefix, generateUniqueId } from '../../../thei/entity-id';
import { validateEventAssets } from '../../../thei/events/validate-assets';
import {
  prepareContentForSave,
  applyPreparedContentSave,
} from '../../../thei/content/repository';
import { applyEventPeriods } from '../../../thei/events/periods';
import {
  prepareEventRelations,
  applyEventRelations,
} from '../../../thei/events/relations';
import {
  prepareEventExternalLinks,
  applyEventExternalLinks,
} from '../../../thei/events/external-links';
import { prepareTagUsages, applyTagUsages } from '../../../thei/tags';
import { syncEntityActionUsages } from '../../../thei/projects/action-usages';
import { cleanupOrphanExternalLinks } from '../../../thei/external-links/repository';

export default defineEventHandler(async (event): Promise<EventSaveResponse> => {
  const body = await readBody<EventEditData>(event);
  const result = validateEventData(body);
  if (typeof result === 'string') return { type: 'error', message: result };
  if (await THEI_SERVER.events.findByPublicId(result.publicId))
    return {
      type: 'error',
      code: 'public-id-taken',
      message: THEI_SERVER.phrase.public_id_already_taken,
    };
  const assetError = await validateEventAssets(result);
  if (assetError) return { type: 'error', message: assetError };

  const eventUuid = await generateUniqueId(
    EntityPrefix.Event,
    async (id) => !(await THEI_SERVER.events.findByUuid(id)),
  );
  try {
    const [contentSave, relations, externalLinks, tags] = await Promise.all([
      prepareContentForSave('event', eventUuid, 'event-body', result.content),
      prepareEventRelations(result.relations),
      prepareEventExternalLinks(result.externalLinks),
      prepareTagUsages(result.tags),
    ]);
    if (contentSave.type !== 'save')
      return { type: 'error', message: 'Event content is required' };

    const { db, schema } = THEI_SERVER.useDb();
    const now = Date.now();
    db.transaction((tx) => {
      tx.insert(schema.events)
        .values({
          eventUuid,
          title: result.title,
          summary: result.summary,
          access: result.access,
          humanReadableSlug: result.humanReadableSlug,
          publicId: result.publicId,
          action: result.action,
          createdAt: now,
          updatedAt: now,
        })
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
      syncEntityActionUsages(tx, schema, [], 'event', eventUuid, result.action);
      result.otherAssets?.forEach((file, order) => {
        tx.insert(schema.assetUsages)
          .values({
            assetUuid: file.assetUuid,
            containerType: 'event',
            containerId: eventUuid,
            role: 'other-asset',
            meta: {
              role: 'other-asset',
              order,
              title: file.title,
              caption: file.caption,
              isPrivate: file.isPrivate,
            },
          })
          .run();
        tx.update(schema.assets)
          .set({ touchedAt: now })
          .where(eq(schema.assets.assetUuid, file.assetUuid))
          .run();
      });
    });
    await cleanupOrphanExternalLinks();
    return { type: 'success', eventUuid, action: result.action };
  } catch (error) {
    return {
      type: 'error',
      message:
        error instanceof Error ? error.message : 'Failed to create event',
    };
  }
});
