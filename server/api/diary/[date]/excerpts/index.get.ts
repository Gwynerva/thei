import type { PublicExcerptsPage } from '#layers/thei/shared/api/public';
import {
  routeExcerptEntity,
  sendPublicExcerptsAbout,
} from '../../../../thei/public/excerpt-routes';

/** One page of the excerpts about this entry, for the block that shows them. */
export default defineEventHandler(async (event): Promise<PublicExcerptsPage> =>
  sendPublicExcerptsAbout(
    event,
    await routeExcerptEntity(event, 'diary-entry', 'date'),
  ),
);
