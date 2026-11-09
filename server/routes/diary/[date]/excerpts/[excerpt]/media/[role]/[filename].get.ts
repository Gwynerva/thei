import {
  routeExcerptEntity,
  sendExcerptBanner,
} from '../../../../../../../thei/public/excerpt-routes';

/** An excerpt's banner, under its diary entry's address. */
export default defineEventHandler(async (event) =>
  sendExcerptBanner(
    event,
    await routeExcerptEntity(event, 'diary-entry', 'date'),
  ),
);
