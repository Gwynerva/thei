import {
  routeExcerptEntity,
  sendExcerptBanner,
} from '../../../../../../../thei/public/excerpt-routes';

/** An excerpt's banner, under its project's address. */
export default defineEventHandler(async (event) =>
  sendExcerptBanner(event, await routeExcerptEntity(event, 'project', 'slug')),
);
