import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { ASSET_ROLES, type AssetRole } from '#layers/thei/shared/asset';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

const MIME: Record<string, string> = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

const KNOWN_ROLES = new Set<string>(ASSET_ROLES);

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug') ?? '';
  const role = getRouterParam(event, 'role') ?? '';
  const filename = getRouterParam(event, 'filename') ?? '';

  if (!KNOWN_ROLES.has(role)) throw createError({ statusCode: 404 });

  const dot = filename.lastIndexOf('.');
  if (dot === -1) throw createError({ statusCode: 404 });
  const link = filename.slice(0, dot);
  const ext = filename.slice(dot + 1).toLowerCase();

  // Resolve project
  const { db, schema } = THEI_SERVER.useDb();
  const project = db
    .select({
      projectId: schema.projects.projectId,
      access: schema.projects.access,
    })
    .from(schema.projects)
    .where(eq(schema.projects.url, slug))
    .get();
  if (!project) throw createError({ statusCode: 404 });

  // Enforce project access level
  if (project.access === ProjectEventAccessLevel.Private) {
    const isAdmin = await THEI_SERVER.isAdmin(event);
    if (!isAdmin) throw createError({ statusCode: 404 });
  }

  // Resolve asset
  const asset = THEI_SERVER.assets.findByLink(link);
  if (!asset || asset.extension !== ext) throw createError({ statusCode: 404 });

  // Verify this asset is actually attached to this project with this role
  const usage = THEI_SERVER.assets.usages.findOne(
    asset.assetUuid,
    'project',
    project.projectId,
    role as AssetRole,
  );
  if (!usage) throw createError({ statusCode: 404 });

  const filePath = THEI_SERVER.assets.filePath(
    asset.assetUuid,
    asset.extension,
  );
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) throw createError({ statusCode: 404 });

  const isPrivate = project.access === ProjectEventAccessLevel.Private;
  setHeader(event, 'Content-Type', MIME[ext] ?? 'application/octet-stream');
  setHeader(event, 'Content-Length', fileStat.size);
  setHeader(
    event,
    'Cache-Control',
    isPrivate ? 'private, no-cache' : 'public, max-age=31536000, immutable',
  );
  return sendStream(event, createReadStream(filePath));
});
