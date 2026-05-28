import { and, eq } from 'drizzle-orm';
import type {
  AssetContainerType,
  AssetRole,
  AssetUsageMeta,
} from '#layers/thei/shared/asset';

export async function updateAssetUsage(
  assetUuid: string,
  containerType: AssetContainerType,
  containerId: string,
  role: AssetRole,
  patch: { meta?: AssetUsageMeta | null },
) {
  const { db, schema } = THEI_SERVER.useDb();
  const updated = await db
    .update(schema.assetUsages)
    .set(patch)
    .where(
      and(
        eq(schema.assetUsages.assetUuid, assetUuid),
        eq(schema.assetUsages.containerType, containerType),
        eq(schema.assetUsages.containerId, containerId),
        eq(schema.assetUsages.role, role),
      ),
    )
    .returning({ assetUuid: schema.assetUsages.assetUuid });

  if (updated.length === 0) {
    throw createError({
      statusCode: 409,
      message: 'Asset usage no longer exists',
    });
  }

  return updated[0]!;
}
