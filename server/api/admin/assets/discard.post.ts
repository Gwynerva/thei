import { deleteStoredAsset } from '../../../thei/assets/storage';

export default defineEventHandler(
  async (event): Promise<{ deleted: boolean }> => {
    const { assetUuid } = await readBody<{ assetUuid?: string }>(event);
    if (!assetUuid) {
      throw createError({ statusCode: 400, message: 'Missing assetUuid' });
    }

    return {
      deleted: await deleteStoredAsset(assetUuid),
    };
  },
);
