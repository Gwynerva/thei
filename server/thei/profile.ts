import { assetSelectionError } from '../../shared/asset-library';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import { createError } from 'h3';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import {
  PROFILE_ID,
  profileAge,
  type AdminProfileResponse,
  type ProfileEditData,
  type ProfileAvatarHistoryItem,
  type ProfileHistoryPage,
} from '#layers/thei/shared/profile';
import type {
  StatusHistoryItem,
  StatusOwner,
} from '#layers/thei/shared/status';
import {
  applyStatusEdits,
  getStatusHistory,
  prepareStatusEdits,
} from './statuses';
import {
  AssetType,
  type AssetContainerType,
  type AssetRole,
} from '#layers/thei/shared/asset';
import { normalizeExternalLinkUrl } from '#layers/thei/shared/external-link';
import { buildPageUrl } from '#layers/thei/shared/page-url';
import { buildAdminAssetUrls, buildPublicProfileMedia } from './assets/urls';
import { resolveGeneratedIcon } from './media/generated-icon';
import {
  buildHistoryPage,
  decodeHistoryCursor,
  olderThan,
} from './history-page';
import {
  applyPreparedContentSave,
  buildContentFieldValue,
  prepareContentForSave,
} from './content/repository';
import { ContentValidationError } from '#layers/thei/shared/content';
import { prepareExternalLinks } from './external-links/prepare';
import {
  cleanupOrphanExternalLinks,
  toExternalLink,
} from './external-links/repository';
import { buildPublicPageIcon } from './public/entities';

export function getProfile() {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select()
    .from(schema.profiles)
    .where(eq(schema.profiles.profileId, PROFILE_ID))
    .get();
  if (!row)
    throw createError({
      statusCode: 503,
      message: 'Profile is not initialized',
    });
  return row;
}

/** The profile is a singleton, so its status owner is a constant. */
export const PROFILE_STATUS_OWNER: StatusOwner = {
  type: 'profile',
  id: PROFILE_ID,
};

export async function profileMedia(
  assetUuid: string | null | undefined,
  container: 'profile' | 'profile-avatar' | 'profile-status',
  id: string,
  role: AssetRole,
  admin = false,
) {
  const asset = assetUuid
    ? await THEI_SERVER.assets.findByUuid(assetUuid)
    : undefined;
  if (!asset) return undefined;
  return admin
    ? (await buildAdminAssetUrls(asset)).media
    : buildPublicProfileMedia(asset, container, id, role);
}

export async function historyItem(
  row: { id: string; createdAt: number; assetUuid: string | null },
  admin = false,
): Promise<ProfileAvatarHistoryItem> {
  return {
    id: row.id,
    createdAt: row.createdAt,
    ...(admin && row.assetUuid ? { assetUuid: row.assetUuid } : {}),
    media: await profileMedia(
      row.assetUuid,
      'profile-avatar',
      row.id,
      'icon',
      admin,
    ),
  };
}

export function getProfileHistory(
  kind: 'avatars',
  cursor?: string,
  admin?: boolean,
  limit?: number,
): Promise<ProfileHistoryPage<ProfileAvatarHistoryItem>>;
export function getProfileHistory(
  kind: 'statuses',
  cursor?: string,
  admin?: boolean,
  limit?: number,
): Promise<ProfileHistoryPage<StatusHistoryItem>>;
export function getProfileHistory(
  kind: 'avatars' | 'statuses',
  cursor?: string,
  admin?: boolean,
  limit?: number,
): Promise<ProfileHistoryPage<ProfileAvatarHistoryItem | StatusHistoryItem>>;
export async function getProfileHistory(
  kind: 'avatars' | 'statuses',
  cursor?: string,
  admin = false,
  limit?: number,
): Promise<ProfileHistoryPage<ProfileAvatarHistoryItem | StatusHistoryItem>> {
  // Statuses live in their own owner-aware table; only avatars are still
  // read here.
  if (kind === 'statuses')
    return getStatusHistory(PROFILE_STATUS_OWNER, cursor, admin, limit);
  const { db, schema } = THEI_SERVER.useDb();
  const table = schema.profileAvatars;
  const pageSize = limit ?? 15;
  const rows = db
    .select()
    .from(table)
    .where(olderThan(table, decodeHistoryCursor(cursor)))
    .orderBy(desc(table.createdAt), desc(table.id))
    .limit(pageSize + 1)
    .all();
  return buildHistoryPage(
    rows,
    pageSize,
    db.select({ value: count() }).from(table).get()!.value,
    (row) => historyItem(row, admin),
  );
}

export async function getProfileIdentity(admin = false) {
  const profile = getProfile();
  const { db, schema } = THEI_SERVER.useDb();
  const avatar = profile.currentAvatarId
    ? db
        .select()
        .from(schema.profileAvatars)
        .where(eq(schema.profileAvatars.id, profile.currentAvatarId))
        .get()
    : undefined;
  return {
    profile,
    currentAvatar: avatar ? await historyItem(avatar, admin) : undefined,
    avatarMedia:
      (avatar
        ? await profileMedia(
            avatar.assetUuid,
            'profile-avatar',
            avatar.id,
            'icon',
            admin,
          )
        : undefined) ?? resolveGeneratedIcon('author', profile.displayName),
    bannerMedia: await profileMedia(
      profile.bannerAssetUuid,
      'profile',
      PROFILE_ID,
      'banner',
      admin,
    ),
    faviconMedia: await profileMedia(
      profile.faviconAssetUuid,
      'profile',
      PROFILE_ID,
      'favicon',
      admin,
    ),
  };
}

export async function getProfileLinks(includePrivate: boolean) {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.profileExternalLinks)
    .innerJoin(
      schema.externalLinks,
      eq(schema.profileExternalLinks.url, schema.externalLinks.url),
    )
    .where(
      includePrivate
        ? undefined
        : eq(schema.profileExternalLinks.isPrivate, false),
    )
    .orderBy(asc(schema.profileExternalLinks.sortOrder))
    .all();
  return rows.map((row) => ({
    ...toExternalLink(row['external-links']),
    name: row['profile-external-links'].name,
    isPrivate: row['profile-external-links'].isPrivate,
  }));
}

export async function getPinnedPages() {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select({ page: schema.pages })
    .from(schema.profilePinnedPages)
    .innerJoin(
      schema.pages,
      eq(schema.profilePinnedPages.pageUuid, schema.pages.pageUuid),
    )
    .where(eq(schema.pages.access, ProjectEventAccessLevel.Public))
    .orderBy(asc(schema.profilePinnedPages.sortOrder))
    .all();
  return Promise.all(
    rows.map(async ({ page }) => ({
      pageUuid: page.pageUuid,
      title: page.title,
      href: buildPageUrl(page.slug),
      media: await buildPublicPageIcon(page),
    })),
  );
}

export async function getAdminProfile(): Promise<AdminProfileResponse> {
  const identity = await getProfileIdentity(true);
  const p = identity.profile;
  const [avatars, statuses, aboutContent, externalLinks, pinnedPages] =
    await Promise.all([
      getProfileHistory('avatars', undefined, true),
      getProfileHistory('statuses', undefined, true),
      buildContentFieldValue('profile', PROFILE_ID, 'profile-about'),
      getProfileLinks(true),
      getPinnedPages(),
    ]);
  return {
    avatarMedia: identity.avatarMedia,
    bannerMedia: identity.bannerMedia,
    faviconMedia: identity.faviconMedia,
    currentAvatar: identity.currentAvatar,
    avatars,
    statuses,
    pinnedPages,
    data: {
      displayName: p.displayName,
      slogan: p.slogan,
      nickname: p.nickname,
      birthDate: p.birthDate,
      avatarAssetUuid: identity.currentAvatar?.assetUuid ?? null,
      avatarChangeId: '',
      bannerAssetUuid: p.bannerAssetUuid,
      faviconAssetUuid: p.faviconAssetUuid,
      facts: p.facts,
      pinnedPageUuids: pinnedPages.map((p) => p.pageUuid),
      externalLinks,
      aboutContent: aboutContent ?? null,
      newStatuses: [],
      updatedStatuses: [],
      deletedAvatarIds: [],
      deletedStatusIds: [],
    },
  };
}

function invalid(message: string): never {
  throw createError({ statusCode: 400, message });
}
function text(value: unknown, max: number, required = false) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (required && !value.trim())
  )
    invalid('Invalid profile text');
  return value.trim();
}
function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalid(message);
  return value as Record<string, unknown>;
}
function optionalId(value: unknown, message: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') invalid(message);
  return ids([value])[0]!;
}
function ids(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    value.some(
      (id) => typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id),
    )
  )
    invalid('Invalid record IDs');
  return [...new Set(value)];
}

export async function saveProfile(input: ProfileEditData) {
  if (!input || typeof input !== 'object') invalid('Invalid profile');
  const displayName = text(input.displayName, 200, true);
  const slogan = text(input.slogan, 1000);
  const nickname = text(input.nickname, 200);
  const birthDate = text(input.birthDate, 10);
  if (birthDate && profileAge(birthDate) === undefined)
    invalid('Invalid birth date');
  if (!Array.isArray(input.facts) || input.facts.length > 100)
    invalid('Invalid facts');
  const facts = input.facts.map((item) => {
    const f = record(item, 'Invalid fact');
    return {
      id: ids([f.id])[0]!,
      name: text(f.name, 200, true),
      value: text(f.value, 10000, true),
    };
  });
  if (new Set(facts.map((f) => f.id)).size !== facts.length)
    invalid('Duplicate facts');
  const pinned = ids(input.pinnedPageUuids);
  const deletedAvatars = ids(input.deletedAvatarIds);
  const preparedStatuses = prepareStatusEdits(PROFILE_STATUS_OWNER, input, {
    invalid,
    ids,
    optionalId,
    text,
  });
  if (!Array.isArray(input.externalLinks) || input.externalLinks.length > 100)
    invalid('Invalid links');
  const links = input.externalLinks.map((item) => {
    const link = record(item, 'Invalid link');
    let url: string;
    try {
      url = normalizeExternalLinkUrl(link.url);
    } catch (error) {
      invalid(error instanceof Error ? error.message : 'Invalid link URL');
    }
    if (typeof link.isPrivate !== 'boolean') invalid('Invalid link privacy');
    let touchedAt: number | undefined;
    if (link.touchedAt !== undefined) {
      if (
        typeof link.touchedAt !== 'number' ||
        !Number.isSafeInteger(link.touchedAt) ||
        link.touchedAt < 0
      )
        invalid('Invalid link timestamp');
      touchedAt = link.touchedAt;
    }
    return {
      url,
      name: text(link.name, 300, true),
      isPrivate: link.isPrivate,
      touchedAt,
    };
  });
  if (new Set(links.map((link) => link.url)).size !== links.length)
    invalid('Duplicate links');
  const { db, schema } = THEI_SERVER.useDb();
  const current = getProfile();
  const currentAvatar = current.currentAvatarId
    ? db
        .select()
        .from(schema.profileAvatars)
        .where(eq(schema.profileAvatars.id, current.currentAvatarId))
        .get()
    : undefined;
  const avatarUuid = optionalId(input.avatarAssetUuid, 'Invalid media');
  const bannerUuid = optionalId(input.bannerAssetUuid, 'Invalid media');
  const faviconUuid = optionalId(input.faviconAssetUuid, 'Invalid media');
  const changedAvatar = avatarUuid !== (currentAvatar?.assetUuid ?? null);
  const avatarId =
    changedAvatar && avatarUuid ? ids([input.avatarChangeId])[0]! : null;
  if (
    current.currentAvatarId &&
    deletedAvatars.includes(current.currentAvatarId)
  )
    invalid('Cannot delete the current avatar from history');
  for (const [assetUuid, imageOnly] of [
    [avatarUuid, false],
    [bannerUuid, false],
    [faviconUuid, true],
    ...preparedStatuses.referencedAssetUuids.map((assetUuid) => [
      assetUuid,
      false,
    ]),
  ] as [string | null, boolean][]) {
    if (!assetUuid) continue;
    if (typeof assetUuid !== 'string') invalid('Invalid media');
    const asset = await THEI_SERVER.assets.findByUuid(assetUuid);
    if (
      !asset ||
      (asset.type !== AssetType.Image &&
        (imageOnly || asset.type !== AssetType.Video))
    )
      invalid('Invalid media type');
    if (
      asset &&
      assetSelectionError(asset, { sizeLimitPolicy: 'media', imageOnly })
    )
      invalid('Invalid media size or type');
  }
  let prepared: Awaited<ReturnType<typeof prepareContentForSave>>;
  try {
    prepared = await prepareContentForSave(
      'profile',
      PROFILE_ID,
      'profile-about',
      input.aboutContent,
    );
  } catch (error) {
    if (
      error instanceof ContentValidationError ||
      error instanceof TypeError ||
      error instanceof RangeError ||
      (error instanceof Error &&
        /^(Invalid|External link|Unsupported|Private sections|Content)/.test(
          error.message,
        ))
    )
      invalid(error instanceof Error ? error.message : 'Invalid content');
    throw error;
  }
  await prepareExternalLinks(links);
  const now = Date.now();
  db.transaction((tx) => {
    function detach(containerType: AssetContainerType, containerId: string) {
      tx.delete(schema.assetUsages)
        .where(
          and(
            eq(schema.assetUsages.containerType, containerType),
            eq(schema.assetUsages.containerId, containerId),
          ),
        )
        .run();
    }
    function attach(
      assetUuid: string | null,
      containerType: AssetContainerType,
      containerId: string,
      role: AssetRole,
    ) {
      if (!assetUuid) return;
      tx.insert(schema.assetUsages)
        .values({ assetUuid, containerType, containerId, role })
        .onConflictDoNothing()
        .run();
      tx.update(schema.assets)
        .set({ touchedAt: now })
        .where(eq(schema.assets.assetUuid, assetUuid))
        .run();
    }
    for (const id of deletedAvatars) {
      detach('profile-avatar', id);
      tx.delete(schema.profileAvatars)
        .where(eq(schema.profileAvatars.id, id))
        .run();
    }
    if (avatarId && avatarUuid) {
      const existing = tx
        .select()
        .from(schema.profileAvatars)
        .where(eq(schema.profileAvatars.id, avatarId))
        .get();
      if (existing && existing.assetUuid !== avatarUuid)
        invalid('Avatar ID already exists');
      tx.insert(schema.profileAvatars)
        .values({ id: avatarId, assetUuid: avatarUuid, createdAt: now })
        .onConflictDoNothing()
        .run();
      attach(avatarUuid, 'profile-avatar', avatarId, 'icon');
    }
    applyStatusEdits(tx, schema, preparedStatuses, now, {
      attach,
      detach,
      invalid,
    });
    tx.update(schema.profiles)
      .set({
        displayName,
        slogan,
        nickname,
        birthDate,
        facts,
        currentAvatarId: changedAvatar ? avatarId : current.currentAvatarId,
        bannerAssetUuid: bannerUuid,
        faviconAssetUuid: faviconUuid,
      })
      .where(eq(schema.profiles.profileId, PROFILE_ID))
      .run();
    detach('profile', PROFILE_ID);
    attach(bannerUuid, 'profile', PROFILE_ID, 'banner');
    attach(faviconUuid, 'profile', PROFILE_ID, 'favicon');
    applyPreparedContentSave(
      tx,
      schema,
      'profile',
      PROFILE_ID,
      'profile-about',
      prepared,
    );
    tx.delete(schema.profilePinnedPages).run();
    const publicIds = new Set(
      pinned.length
        ? tx
            .select()
            .from(schema.pages)
            .where(
              and(
                inArray(schema.pages.pageUuid, pinned),
                eq(schema.pages.access, ProjectEventAccessLevel.Public),
              ),
            )
            .all()
            .map((p) => p.pageUuid)
        : [],
    );
    pinned
      .filter((id) => publicIds.has(id))
      .forEach((pageUuid, sortOrder) =>
        tx
          .insert(schema.profilePinnedPages)
          .values({ pageUuid, sortOrder })
          .run(),
      );
    tx.delete(schema.profileExternalLinks).run();
    links.forEach((link, sortOrder) =>
      tx
        .insert(schema.profileExternalLinks)
        .values({
          url: link.url,
          name: link.name,
          isPrivate: link.isPrivate,
          sortOrder,
        })
        .run(),
    );
  });
  await cleanupOrphanExternalLinks().catch((error) =>
    THEI_SERVER.console
      .tag('External links')
      .warn('Failed to clean profile link previews', error),
  );
  return getAdminProfile();
}
