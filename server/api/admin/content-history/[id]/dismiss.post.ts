import { dismissContentDraft } from '../../../../thei/content/history';

/** The owner declined a draft: it stays as a version and is offered no more. */
export default defineEventHandler((event) => {
  if (!dismissContentDraft(getRouterParam(event, 'id') ?? ''))
    throw createError({ statusCode: 404, message: 'Not found' });
  return { dismissed: true };
});
