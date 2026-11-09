import type { EventEditData } from '#layers/thei/shared/event';
import { excerptsOnTargetDeleteOf } from '../../../thei/excerpts';
import { formVersion } from '../../../thei/entity-edit';
import {
  deleteEvent,
  readEventEdit,
  saveEventEdit,
} from '../../../thei/events/edit';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'eventUuid')!;
  const stored =
    (await THEI_SERVER.events.findByUuid(identifier)) ??
    (await THEI_SERVER.events.findByPublicId(identifier));
  if (!stored)
    throw createError({ statusCode: 404, message: 'Event not found' });

  switch (event.method) {
    case 'GET':
      return readEventEdit(stored);
    case 'PUT': {
      const body = await readBody<EventEditData>(event);
      return saveEventEdit(stored.eventUuid, body, {
        expectedUpdatedAt: formVersion(body),
      });
    }
    case 'DELETE':
      await deleteEvent(stored.eventUuid, {
        excerpts: excerptsOnTargetDeleteOf(getQuery(event).excerpts),
      });
      return;
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
