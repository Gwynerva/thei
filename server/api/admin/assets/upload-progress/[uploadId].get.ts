import { getAssetUploadProgress } from '../../../../thei/assets/progress';

export default defineEventHandler((event) => {
  const uploadId = getRouterParam(event, 'uploadId');
  if (!uploadId) {
    throw createError({ statusCode: 400, message: 'Missing uploadId' });
  }

  return getAssetUploadProgress(uploadId);
});
