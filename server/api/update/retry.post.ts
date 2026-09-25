import { restartServer, UpdateRefused } from '#layers/thei/update/process';
import { bootResult } from '../../thei/boot/result';

export type UpdateRetryResponse = { type: 'success' };

/**
 * Restarts a site that stayed closed after a failed update step. The boot
 * that follows carries on from the ledger: finished steps stay finished, and
 * the failed one runs again.
 */
export default defineEventHandler(
  async (event): Promise<UpdateRetryResponse> => {
    const failed =
      bootResult.type === 'error' ||
      (bootResult.type === 'update' &&
        bootResult.failure !== undefined &&
        bootResult.failure.reason !== 'downgrade');

    if (!failed) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Nothing to retry',
      });
    }

    if (!(await THEI_SERVER.isAdmin(event))) {
      throw createError({ statusCode: 403, statusMessage: 'Forbidden' });
    }

    try {
      restartServer();
    } catch (error) {
      if (error instanceof UpdateRefused) {
        throw createError({ statusCode: 409, statusMessage: error.message });
      }
      throw error;
    }

    THEI_SERVER.console
      .tag('Update')
      .log('Retry requested from the update screen.');
    return { type: 'success' };
  },
);
