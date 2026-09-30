import { getUploadJob } from '../../../thei/assets/jobs';
import { getAssetUploadProgress } from '../../../thei/assets/progress';

/**
 * Where an upload is: a job run in the background, or the phases of a
 * request still open. `null` is "nothing known": the request has not been
 * seen yet, or its job was forgotten by a restart.
 */
export default defineEventHandler((event) => {
  const uploadId = getRouterParam(event, 'uploadId');
  if (!uploadId) {
    throw createError({ statusCode: 400, message: 'Missing uploadId' });
  }

  return getUploadJob(uploadId) ?? getAssetUploadProgress(uploadId);
});
