import { and, eq } from 'drizzle-orm';
import type { AssetRole, AssetUsageMeta } from '#layers/thei/shared/asset';
import type { ProjectActionEditData } from '#layers/thei/shared/project-action';

const ACTION_ROLES = [
  ['action-icon', 'iconAssetUuid'],
  ['action-background', 'backgroundAssetUuid'],
  ['action-file', 'fileAssetUuid'],
] as const;

type CurrentUsage = {
  asset: { assetUuid: string };
  role: AssetRole;
  meta?: AssetUsageMeta | null;
};

export function syncProjectActionUsages(
  tx: any,
  schema: any,
  currentUsages: CurrentUsage[],
  projectUuid: string,
  action: ProjectActionEditData,
) {
  for (const [role, field] of ACTION_ROLES) {
    const currentForRole = currentUsages.filter((usage) => usage.role === role);
    const nextAssetUuid = action[field];
    const nextMeta = { role, isPrivate: action.isPrivate } as const;
    const current = currentForRole.find(
      (usage) => usage.asset.assetUuid === nextAssetUuid,
    );

    for (const stale of currentForRole) {
      if (stale.asset.assetUuid !== nextAssetUuid)
        deleteUsage(tx, schema, stale.asset.assetUuid, projectUuid, role);
    }

    if (!current) {
      if (nextAssetUuid)
        tx.insert(schema.assetUsages)
          .values({
            assetUuid: nextAssetUuid,
            containerType: 'project',
            containerId: projectUuid,
            role,
            meta: nextMeta,
          })
          .onConflictDoNothing()
          .run();
      continue;
    }

    if (
      nextAssetUuid &&
      (!current?.meta ||
        current.meta.role !== role ||
        !('isPrivate' in current.meta) ||
        current.meta.isPrivate !== action.isPrivate)
    ) {
      tx.update(schema.assetUsages)
        .set({ meta: nextMeta })
        .where(usageWhere(schema, nextAssetUuid, projectUuid, role))
        .run();
    }
  }
}

function deleteUsage(
  tx: any,
  schema: any,
  assetUuid: string,
  projectUuid: string,
  role: AssetRole,
) {
  tx.delete(schema.assetUsages)
    .where(usageWhere(schema, assetUuid, projectUuid, role))
    .run();
}

function usageWhere(
  schema: any,
  assetUuid: string,
  projectUuid: string,
  role: AssetRole,
) {
  return and(
    eq(schema.assetUsages.assetUuid, assetUuid),
    eq(schema.assetUsages.containerType, 'project'),
    eq(schema.assetUsages.containerId, projectUuid),
    eq(schema.assetUsages.role, role),
  );
}
