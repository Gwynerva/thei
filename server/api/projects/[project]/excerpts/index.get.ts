import type { PublicExcerptsPage } from '#layers/thei/shared/api/public';
import {
  routeExcerptEntity,
  sendPublicExcerptsAbout,
} from '../../../../thei/public/excerpt-routes';
import { PUBLIC_PROJECT_EXCERPTS_SIZE } from '../../../../thei/public/excerpts';

/**
 * The latest excerpts about this project, for the block that shows them: the
 * rest are read on its chronology.
 */
export default defineEventHandler(async (event): Promise<PublicExcerptsPage> =>
  sendPublicExcerptsAbout(
    event,
    await routeExcerptEntity(event, 'project', 'project'),
    PUBLIC_PROJECT_EXCERPTS_SIZE,
  ),
);
