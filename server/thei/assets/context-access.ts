import { and, eq, inArray, or } from 'drizzle-orm';
import { createError, setHeader, type H3Event } from 'h3';
import {
  ProjectEventAccessLevel,
  SiteAccessLevel,
} from '../../../shared/access-level';
import type { AssetRole, ContentAssetUsageMeta } from '../../../shared/asset';
import { ENTITY_NOTES_SLOTS } from '../../../shared/entity-notes';
import type { ShareGrantOwner } from '../../../shared/share-link';
import { assetUsageIsPrivate } from './access';
import {
  publicAssetFilename,
  resolvePublicAssetVariant,
} from './public-preview';
import { sendAssetFile } from './send-file';
import {
  OWNER_ASSET_CACHE_CONTROL,
  PUBLIC_ASSET_CACHE_CONTROL,
  SHARED_ASSET_CACHE_CONTROL,
} from './cache-control';
import { opensGrantOwner, resolvePublicViewer } from '../access-links/viewer';

interface AttachmentContext {
  ownerType:
    | 'project'
    | 'project-section'
    | 'event'
    | 'page'
    | 'diary-entry'
    | 'tag'
    | 'profile'
    | 'profile-avatar'
    | 'profile-status'
    | 'project-status';
  ownerId: string;
  access?: ProjectEventAccessLevel;
  /**
   * The entity whose share link opens this file. Defaults to the owner itself
   * for a project, an event, a page or a diary entry; anything else is opened
   * by no link unless the route names the entity it belongs to.
   */
  grantOwner?: ShareGrantOwner;
  role: AssetRole;
  filename: string;
}

function defaultGrantOwner(
  context: AttachmentContext,
): ShareGrantOwner | undefined {
  const { ownerType, ownerId } = context;
  return ownerType === 'project' ||
    ownerType === 'event' ||
    ownerType === 'page' ||
    ownerType === 'diary-entry'
    ? { entityType: ownerType, entityId: ownerId }
    : undefined;
}

const NOTES_SLOTS = new Set<string>(Object.values(ENTITY_NOTES_SLOTS));

/**
 * Where a file is used in this URL's entity, and who may therefore have it.
 *
 * - `public`: a stranger — some use sits outside every private part;
 * - `shared`: a share link's holder — some use is in the entity's own content,
 *   private parts included, but not in the owner's notes;
 * - `exists`: the owner — any use at all.
 */
export async function contentAttachmentAccess(
  ownerType: 'project' | 'event' | 'page' | 'profile' | 'diary-entry',
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
    const sections = db
      .select()
      .from(schema.projectContentSections)
      .where(eq(schema.projectContentSections.projectUuid, ownerId))
      .all();
    if (sections.length)
      owners.push(
        and(
          eq(schema.content.ownerType, 'project-section'),
          inArray(
            schema.content.ownerId,
            sections.map((section) => section.sectionUuid),
          ),
        )!,
      );
    for (const section of sections)
      if (section.isPrivate)
        privateOwners.add(`project-section:${section.sectionUuid}`);
  }
  const uses = db
    .select({
      ownerType: schema.content.ownerType,
      ownerId: schema.content.ownerId,
      slot: schema.content.slot,
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
  // The owner's notes are theirs alone: a file placed only there reaches
  // neither a visitor nor the holder of a share link.
  const content = uses.filter((use) => !NOTES_SLOTS.has(use.slot));
  return {
    exists: uses.length > 0,
    shared: content.length > 0,
    public: content.some((use) => {
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
  setHeader(event, 'Cache-Control', SHARED_ASSET_CACHE_CONTROL);
  const viewer = await resolvePublicViewer(event);
  // A share link reaches the media of the entity it was made for, including
  // files inside its private sections, and nothing else.
  const opens = opensGrantOwner(
    viewer,
    context.grantOwner ?? defaultGrantOwner(context),
  );
  const viaShare = opens && !viewer.isAdmin;
  const publicParent =
    THEI_SERVER.config.siteAccessLevel !== SiteAccessLevel.Private &&
    context.access !== ProjectEventAccessLevel.Private;
  if (!publicParent && !opens) throw createError({ statusCode: 404 });
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
  let access: { exists: boolean; shared: boolean; public: boolean };
  if (
    context.role === 'content' &&
    (context.ownerType === 'project' ||
      context.ownerType === 'event' ||
      context.ownerType === 'page' ||
      context.ownerType === 'diary-entry' ||
      context.ownerType === 'profile')
  ) {
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
      shared: Boolean(usage),
      public: Boolean(usage) && !assetUsageIsPrivate(usage!.meta),
    };
  }
  const publicAccess = publicParent && access.public;
  const allowed =
    publicAccess || (viewer.isAdmin ? access.exists : opens && access.shared);
  if (!allowed) throw createError({ statusCode: 404 });
  const selected = await resolvePublicAssetVariant(event, asset);
  return sendAssetFile(
    event,
    THEI_SERVER.assets.filePath(selected.contentHash, selected.extension),
    selected.extension,
    {
      cacheControl: publicAccess
        ? PUBLIC_ASSET_CACHE_CONTROL
        : viaShare
          ? SHARED_ASSET_CACHE_CONTROL
          : OWNER_ASSET_CACHE_CONTROL,
      etag: `"${selected.contentHash}"`,
      filename: publicAssetFilename(context.filename, asset, selected),
    },
  );
}
