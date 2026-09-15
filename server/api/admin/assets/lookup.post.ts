import { findStoredAssetByHash } from '../../../thei/assets/lookup';
import { buildAssetVariantInfo } from '../../../thei/assets/storage';
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (
    !body ||
    typeof body.hash !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(body.hash) ||
    (body.size !== undefined &&
      (!Number.isSafeInteger(body.size) || body.size < 0))
  )
    throw createError({ statusCode: 400, message: 'Invalid file identity' });
  const asset = await findStoredAssetByHash(body.hash.toLowerCase(), body.size);
  return { asset: asset ? await buildAssetVariantInfo(asset) : null };
});
