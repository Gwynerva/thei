import { and, eq, inArray, or } from 'drizzle-orm';
import { createError, setHeader, type H3Event } from 'h3';
import {
  ProjectEventAccessLevel,
  SiteAccessLevel,
} from '../../../shared/access-level';
import type { AssetRole, ContentAssetUsageMeta } from '../../../shared/asset';
import { assetUsageIsPrivate } from './access';
import {
  publicAssetFilename,
  resolvePublicAssetVariant,
} from './public-preview';
import { sendAssetFile } from './send-file';

interface AttachmentContext {
  ownerType: 'project' | 'event' | 'page' | 'tag';
  ownerId: string;
  access?: ProjectEventAccessLevel;
  role: AssetRole;
  filename: string;
}

/** A public use must belong to this URL's entity and an accessible owner. */
export async function contentAttachmentAccess(
  ownerType: 'project' | 'event' | 'page',
  ownerId: string,
  assetUuid: string,
) {
  const { db, schema } = THEI_SERVER.useDb();
  const owners = [
    and(
      eq(schema.content.ownerType, ownerType),
      eq(schema.content.ownerId, ownerId),
    )!,
  ];
  const privateOwners = new Set<string>();
  if (ownerType === 'project') {
    const stages = db
      .select()
      .from(schema.projectStages)
      .where(eq(schema.projectStages.projectUuid, ownerId))
      .all();
    const sections = db
      .select()
      .from(schema.projectContentSections)
      .where(eq(schema.projectContentSections.projectUuid, ownerId))
      .all();
    for (const [type, children] of [
      [
        'project-stage',
        stages.map((stage) => ({
          id: stage.stageUuid,
          isPrivate: stage.isPrivate,
        })),
      ],
      [
        'project-section',
        sections.map((section) => ({
          id: section.sectionUuid,
          isPrivate: section.isPrivate,
        })),
      ],
    ] as const) {
      if (children.length)
        owners.push(
          and(
            eq(schema.content.ownerType, type),
            inArray(
              schema.content.ownerId,
              children.map(({ id }) => id),
            ),
          )!,
        );
      for (const child of children)
        if (child.isPrivate) privateOwners.add(`${type}:${child.id}`);
    }
  }
  const uses = db
    .select({
      ownerType: schema.content.ownerType,
      ownerId: schema.content.ownerId,
      meta: schema.assetUsages.meta,
    })
    .from(schema.content)
    .innerJoin(
      schema.assetUsages,
      and(
        eq(schema.assetUsages.containerType, 'content'),
        eq(schema.assetUsages.containerId, schema.content.contentUuid),
        eq(schema.assetUsages.assetUuid, assetUuid),
        eq(schema.assetUsages.role, 'content'),
      ),
    )
    .where(or(...owners))
    .all();
  return {
    exists: uses.length > 0,
    public: uses.some((use) => {
      if (privateOwners.has(`${use.ownerType}:${use.ownerId}`)) return false;
      const meta = use.meta as ContentAssetUsageMeta | null;
      return (
        meta?.role === 'content' && meta.refs.some((ref) => !ref.isPrivate)
      );
    }),
  };
}

/** Authorization precedes preview selection, ranges and conditional responses. */
export async function sendContextAsset(
  event: H3Event,
  context: AttachmentContext,
) {
  setHeader(event, 'Cache-Control', 'private, no-store');
  const isAdmin = await THEI_SERVER.isAdmin(event);
  const publicParent =
    THEI_SERVER.config.siteAccessLevel !== SiteAccessLevel.Private &&
    context.access !== ProjectEventAccessLevel.Private;
  if (!publicParent && !isAdmin) throw createError({ statusCode: 404 });
  const dot = context.filename.lastIndexOf('.');
  if (dot <= 0) throw createError({ statusCode: 404 });
  const asset = await THEI_SERVER.assets.findBySlug(
    context.filename.slice(0, dot),
  );
  if (
    !asset ||
    asset.extension !== context.filename.slice(dot + 1).toLowerCase()
  )
    throw createError({ statusCode: 404 });
  let access: { exists: boolean; public: boolean };
  if (context.role === 'content' && context.ownerType !== 'tag') {
    access = await contentAttachmentAccess(
      context.ownerType,
      context.ownerId,
      asset.assetUuid,
    );
  } else {
    const usage = await THEI_SERVER.assets.usages.findOne(
      asset.assetUuid,
      context.ownerType,
      context.ownerId,
      context.role,
    );
    access = {
      exists: Boolean(usage),
      public: Boolean(usage) && !assetUsageIsPrivate(usage!.meta),
    };
  }
  const publicAccess = publicParent && access.public;
  if (!access.exists || (!publicAccess && !isAdmin))
    throw createError({ statusCode: 404 });
  const selected = await resolvePublicAssetVariant(event, asset);
  return sendAssetFile(
    event,
    THEI_SERVER.assets.filePath(selected.assetUuid, selected.extension),
    selected.extension,
    {
      cacheControl: publicAccess
        ? 'public, max-age=0, must-revalidate'
        : 'private, no-store',
      etag: `"${selected.contentHash}"`,
      filename: publicAssetFilename(context.filename, asset, selected),
    },
  );
}
