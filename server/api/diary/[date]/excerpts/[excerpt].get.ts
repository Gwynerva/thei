import type { PublicExcerptResponse } from '#layers/thei/shared/api/public';
import {
  routeExcerptEntity,
  sendPublicExcerpt,
} from '../../../../thei/public/excerpt-routes';

/** An excerpt's own page, under its diary entry's. */
export default defineEventHandler(
  async (event): Promise<PublicExcerptResponse> =>
    sendPublicExcerpt(
      event,
      await routeExcerptEntity(event, 'diary-entry', 'date'),
    ),
);
