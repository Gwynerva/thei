import type { EventEditData } from '#layers/thei/shared/event';
import { createEvent } from '../../../thei/events/create';

export default defineEventHandler(async (event) =>
  createEvent(await readBody<EventEditData>(event)),
);
