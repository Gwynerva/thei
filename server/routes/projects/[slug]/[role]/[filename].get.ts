import { eq } from 'drizzle-orm';
import { ASSET_ROLES, type AssetRole } from '#layers/thei/shared/asset';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import { assetUsageIsPrivate } from '../../../../thei/assets/access';
import { sendAssetFile } from '../../../../thei/assets/send-file';
import { publicIdFromProjectUrlPart } from '#layers/thei/shared/project-url';

const KNOWN_ROLES = new Set<string>(ASSET_ROLES);

export default defineEventHandler(async (event) => {
  const urlPart = getRouterParam(event, 'slug') ?? '';
  const role = getRouterParam(event, 'role') ?? '';
  const filename = getRouterParam(event, 'filename') ?? '';

  if (!KNOWN_ROLES.has(role)) throw createError({ statusCode: 404 });

  const dot = filename.lastIndexOf('.');
  if (dot === -1) throw createError({ statusCode: 404 });
  const assetSlug = filename.slice(0, dot);
  const ext = filename.slice(dot + 1).toLowerCase();

  // Resolve project
  const { db, schema } = THEI_SERVER.useDb();
  const [project] = await db
    .select({
      projectUuid: schema.projects.projectUuid,
      access: schema.projects.access,
    })
    .from(schema.projects)
    .where(eq(schema.projects.publicId, publicIdFromProjectUrlPart(urlPart)))
    .limit(1);
  if (!project) throw createError({ statusCode: 404 });

  const isAdmin = await THEI_SERVER.isAdmin(event);
  if (project.access === ProjectEventAccessLevel.Private && !isAdmin) {
    throw createError({ statusCode: 404 });
  }

  // Resolve asset
  const asset = await THEI_SERVER.assets.findBySlug(assetSlug);
  if (!asset || asset.extension !== ext) throw createError({ statusCode: 404 });

  // Verify this asset is actually attached to this project with this role
  const usage = await THEI_SERVER.assets.usages.findOne(
    asset.assetUuid,
    'project',
    project.projectUuid,
    role as AssetRole,
  );
  if (!usage) throw createError({ statusCode: 404 });

  const isPrivateAsset = assetUsageIsPrivate(usage.meta);
  if (isPrivateAsset && !isAdmin) throw createError({ statusCode: 404 });

  const isPrivate =
    project.access === ProjectEventAccessLevel.Private || isPrivateAsset;
  const filePath = THEI_SERVER.assets.filePath(
    asset.assetUuid,
    asset.extension,
  );
  return sendAssetFile(event, filePath, asset.extension, {
    cacheControl: isPrivate
      ? 'private, no-cache'
      : 'public, max-age=31536000, immutable',
    filename,
  });
});
