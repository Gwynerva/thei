import type {
  AssetDescription,
  AssetDescriptionSave,
} from '#layers/thei/shared/asset-description';
import {
  AssetDescriptionConflict,
  AssetDescriptionInvalid,
  assetFamilyOf,
  writeAssetDescription,
} from '../../../../thei/assets/descriptions';

/**
 * Saves a file's description for its whole family, over the version the
 * field read: a change made since is refused with what it is now.
 */
export default defineEventHandler(async (event): Promise<AssetDescription> => {
  const assetUuid = getRouterParam(event, 'assetUuid') ?? '';
  if (!assetFamilyOf(assetUuid))
    throw createError({ statusCode: 404, message: 'File not found' });
  const body = (await readBody<Partial<AssetDescriptionSave>>(event)) ?? {};
  if (typeof body.text !== 'string')
    throw createError({ statusCode: 400, message: 'Text is required' });
  const expected = body.expectedUpdatedAt;
  if (expected !== null && typeof expected !== 'number')
    throw createError({
      statusCode: 400,
      message: 'expectedUpdatedAt is required',
    });
  try {
    const { familyUuid: _family, ...saved } = writeAssetDescription(
      assetUuid,
      body.text,
      { expectedUpdatedAt: expected },
    );
    return saved;
  } catch (error) {
    if (error instanceof AssetDescriptionConflict)
      throw createError({
        statusCode: 409,
        message: error.message,
        data: error.current,
      });
    if (error instanceof AssetDescriptionInvalid)
      throw createError({ statusCode: 400, message: error.message });
    throw error;
  }
});
