import type { PublicFilePlace } from '#layers/thei/shared/api/public';
import { findPublicFilePlaces } from '../../../thei/public/file-places';

/**
 * The other pages a file is shown on, by the slug its public addresses carry.
 * Built for a stranger, whoever asks.
 */
export default defineEventHandler(
  async (event): Promise<{ places: PublicFilePlace[] }> => ({
    places: await findPublicFilePlaces(getRouterParam(event, 'file') ?? ''),
  }),
);
