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
import {
  opensGrantOwner,
  opensPrivate,
  resolvePublicViewer,
  STRANGER,
  type PublicViewer,
} from '../access-links/viewer';
import { readExcerptSubjects } from '../excerpts/subjects';
import { excerptIsOwn, excerptOpens } from '../excerpts/parents';

interface AttachmentContext {
  ownerType:
    | 'project'
    | 'project-section'
    | 'excerpt'
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
  /**
   * Whether a viewer's links open this file, where no one entity's link
   * says it: an excerpt's banner opens to whoever may open the excerpt
   * (`excerptOpens`). Takes the place of `grantOwner`.
   */
  opens?: (viewer: PublicViewer) => boolean;
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

/** What an excerpt's files are judged by: its own flag and what it is about. */
type JudgedExcerpt = Parameters<typeof excerptOpens>[1];

/** The entity whose address a file of its content is asked for at. */
export type ContentAttachmentOwner = {
  type: 'project' | 'event' | 'page' | 'profile' | 'diary-entry';
  id: string;
  /** How open it is; none for the profile, which is as open as the site. */
  access?: ProjectEventAccessLevel;
};

/**
 * Where a file is used in this URL's entity, and who may therefore have it.
 *
 * - `public`: a stranger — some use sits outside every private part, in a
 *   part a stranger may open;
 * - `granted`: this viewer — some use is in a part they may open, private
 *   parts included where the entity's private side is theirs, but never in
 *   the owner's notes;
 * - `exists`: the owner — any use at all.
 *
 * An excerpt's pictures are served from its parent's address, as a
 * section's are from its project's, but each use in an excerpt is judged as
 * the excerpt is: for whoever may open it (`excerptOpens`) — a link to its
 * subject may, where its parent's alone may not — and its private parts for
 * the parent's private side, as its page shows them.
 */
export async function contentAttachmentAccess(
  owner: ContentAttachmentOwner,
  assetUuid: string,
  viewer: PublicViewer = STRANGER,
) {
  const { db, schema } = THEI_SERVER.useDb();
  const { type: ownerType, id: ownerId } = owner;
  const owners = [
    and(
      eq(schema.content.ownerType, ownerType),
      eq(schema.content.ownerId, ownerId),
    )!,
  ];
  const privateSections = new Set<string>();
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
      if (section.isPrivate) privateSections.add(section.sectionUuid);
  }
  const excerpts = new Map<string, JudgedExcerpt>();
  const parent =
    ownerType === 'project' ||
    ownerType === 'event' ||
    ownerType === 'diary-entry'
      ? {
          type: ownerType,
          id: ownerId,
          access: owner.access ?? ProjectEventAccessLevel.Public,
        }
      : undefined;
  if (parent) {
    const rows = db
      .select({
        excerptUuid: schema.excerpts.excerptUuid,
        isPrivate: schema.excerpts.isPrivate,
      })
      .from(schema.excerpts)
      .where(
        and(
          eq(schema.excerpts.parentType, parent.type),
          eq(schema.excerpts.parentId, parent.id),
        ),
      )
      .all();
    if (rows.length)
      owners.push(
        and(
          eq(schema.content.ownerType, 'excerpt'),
          inArray(
            schema.content.ownerId,
            rows.map((row) => row.excerptUuid),
          ),
        )!,
      );
    const subjects = readExcerptSubjects(
      db,
      schema,
      rows.map((row) => row.excerptUuid),
    );
    for (const row of rows)
      excerpts.set(row.excerptUuid, {
        isPrivate: row.isPrivate,
        subject: subjects.get(row.excerptUuid) ?? null,
      });
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
  /** Whether one use of the file is for this reader. */
  const opensTo = (use: (typeof uses)[number], reader: PublicViewer) => {
    const meta = use.meta as ContentAssetUsageMeta | null;
    const outside =
      meta?.role === 'content' && meta.refs.some((ref) => !ref.isPrivate);
    if (use.ownerType === 'excerpt') {
      const excerpt = excerpts.get(use.ownerId);
      return Boolean(
        parent &&
        excerpt &&
        excerptOpens(reader, excerpt, parent) &&
        (outside || excerptIsOwn(reader, parent)),
      );
    }
    // The entity's own private side: the owner's, or its share link's.
    const own =
      ownerType === 'profile'
        ? reader.isAdmin
        : opensPrivate(reader, ownerType, ownerId);
    if (use.ownerType === 'project-section' && privateSections.has(use.ownerId))
      return own;
    return (
      (own || owner.access !== ProjectEventAccessLevel.Private) &&
      (outside || own)
    );
  };
  return {
    exists: uses.length > 0,
    granted: content.some((use) => opensTo(use, viewer)),
    public: content.some((use) => opensTo(use, STRANGER)),
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
  const opens = context.opens
    ? viewer.isAdmin || context.opens(viewer)
    : opensGrantOwner(viewer, context.grantOwner ?? defaultGrantOwner(context));
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
  let access: { exists: boolean; granted: boolean; public: boolean };
  if (
    context.role === 'content' &&
    (context.ownerType === 'project' ||
      context.ownerType === 'event' ||
      context.ownerType === 'page' ||
      context.ownerType === 'diary-entry' ||
      context.ownerType === 'profile')
  ) {
    // Judged use by use: a part of the entity may open to other links
    // than the entity's own — an excerpt's to its subject's.
    access = await contentAttachmentAccess(
      {
        type: context.ownerType,
        id: context.ownerId,
        access: context.access,
      },
      asset.assetUuid,
      viewer,
    );
  } else {
    const usage = await THEI_SERVER.assets.usages.findOne(
      asset.assetUuid,
      context.ownerType,
      context.ownerId,
      context.role,
    );
    const visible = Boolean(usage) && !assetUsageIsPrivate(usage!.meta);
    access = {
      exists: Boolean(usage),
      granted: Boolean(usage) && (opens || (publicParent && visible)),
      public: visible,
    };
  }
  const publicAccess = publicParent && access.public;
  const allowed = viewer.isAdmin ? access.exists : access.granted;
  if (!allowed) throw createError({ statusCode: 404 });
  const viaShare = !viewer.isAdmin && !publicAccess;
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
