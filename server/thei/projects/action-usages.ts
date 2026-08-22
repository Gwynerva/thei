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
  syncEntityActionUsages(
    tx,
    schema,
    currentUsages,
    'project',
    projectUuid,
    action,
  );
}

export function syncEntityActionUsages(
  tx: any,
  schema: any,
  currentUsages: CurrentUsage[],
  containerType: 'project' | 'event',
  containerId: string,
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
        deleteUsage(
          tx,
          schema,
          stale.asset.assetUuid,
          containerType,
          containerId,
          role,
        );
    }

    if (!current) {
      if (nextAssetUuid)
        tx.insert(schema.assetUsages)
          .values({
            assetUuid: nextAssetUuid,
            containerType,
            containerId,
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
        .where(
          usageWhere(schema, nextAssetUuid, containerType, containerId, role),
        )
        .run();
    }
  }
}

function deleteUsage(
  tx: any,
  schema: any,
  assetUuid: string,
  containerType: 'project' | 'event',
  containerId: string,
  role: AssetRole,
) {
  tx.delete(schema.assetUsages)
    .where(usageWhere(schema, assetUuid, containerType, containerId, role))
    .run();
}

function usageWhere(
  schema: any,
  assetUuid: string,
  containerType: 'project' | 'event',
  containerId: string,
  role: AssetRole,
) {
  return and(
    eq(schema.assetUsages.assetUuid, assetUuid),
    eq(schema.assetUsages.containerType, containerType),
    eq(schema.assetUsages.containerId, containerId),
    eq(schema.assetUsages.role, role),
  );
}
