import { cancelUploadJob } from '../../../thei/assets/jobs';

/** Cancels a commit run as a job: a queued encode leaves, a running one stops. */
export default defineEventHandler((event) => {
  const uploadId = getRouterParam(event, 'uploadId');
  if (uploadId) cancelUploadJob(uploadId);
  setResponseStatus(event, 204);
  return null;
});
