import type { PageEditData } from '#layers/thei/shared/page';
import { formVersion } from '../../../thei/entity-edit';
import {
  deletePageEdit,
  readPageEdit,
  savePageEdit,
} from '../../../thei/pages/edit';

export default defineEventHandler(async (event) => {
  const identifier = getRouterParam(event, 'pageUuid') ?? '';
  const stored =
    (await THEI_SERVER.pages.findByUuid(identifier)) ??
    (await THEI_SERVER.pages.findBySlug(identifier));
  if (!stored)
    throw createError({ statusCode: 404, message: 'Page not found' });

  switch (event.method) {
    case 'GET':
      return readPageEdit(stored);
    case 'PUT': {
      const body = await readBody<PageEditData>(event);
      return savePageEdit(stored, body, {
        expectedUpdatedAt: formVersion(body),
      });
    }
    case 'DELETE':
      await deletePageEdit(stored);
      return;
  }

  throw createError({ statusCode: 405, message: 'Method not allowed' });
});
