import { assetSelectionError } from '../../shared/asset-library';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lt,
  notInArray,
  or,
} from 'drizzle-orm';
import { createError } from 'h3';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';
import {
  PROFILE_ID,
  canAppendEmptyProfileStatus,
  profileAge,
  type AdminProfileResponse,
  type ProfileEditData,
  type ProfileAvatarHistoryItem,
  type ProfileHistoryPage,
  type ProfileStatusHistoryItem,
} from '#layers/thei/shared/profile';
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

export function historyItem(
  row: {
    id: string;
    createdAt: number;
    assetUuid: string | null;
    text?: string;
    kind?: 'regular' | 'empty';
  },
  kind: 'avatars',
  admin?: boolean,
): Promise<ProfileAvatarHistoryItem>;
export function historyItem(
  row: {
    id: string;
    createdAt: number;
    assetUuid: string | null;
    text: string;
    kind: 'regular' | 'empty';
  },
  kind: 'statuses',
  admin?: boolean,
): Promise<ProfileStatusHistoryItem>;
export async function historyItem(
  row: {
    id: string;
    createdAt: number;
    assetUuid: string | null;
    text?: string;
    kind?: 'regular' | 'empty';
  },
  kind: 'avatars' | 'statuses',
  admin = false,
): Promise<ProfileAvatarHistoryItem | ProfileStatusHistoryItem> {
  const common = {
    id: row.id,
    createdAt: row.createdAt,
    ...(admin && row.assetUuid ? { assetUuid: row.assetUuid } : {}),
    media: await profileMedia(
      row.assetUuid,
      kind === 'avatars' ? 'profile-avatar' : 'profile-status',
      row.id,
      'icon',
      admin,
    ),
  };
  return kind === 'avatars'
    ? common
    : {
        ...common,
        kind: row.kind ?? 'regular',
        text: row.text ?? '',
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
): Promise<ProfileHistoryPage<ProfileStatusHistoryItem>>;
export function getProfileHistory(
  kind: 'avatars' | 'statuses',
  cursor?: string,
  admin?: boolean,
  limit?: number,
): Promise<
  ProfileHistoryPage<ProfileAvatarHistoryItem | ProfileStatusHistoryItem>
>;
export async function getProfileHistory(
  kind: 'avatars' | 'statuses',
  cursor?: string,
  admin = false,
  limit = kind === 'avatars' ? 15 : 30,
): Promise<
  ProfileHistoryPage<ProfileAvatarHistoryItem | ProfileStatusHistoryItem>
> {
  const { db, schema } = THEI_SERVER.useDb();
  const table =
    kind === 'avatars' ? schema.profileAvatars : schema.profileStatuses;
  let boundary: { createdAt: number; id: string } | undefined;
  if (cursor) {
    try {
      boundary = JSON.parse(Buffer.from(cursor, 'base64url').toString());
      if (
        !boundary ||
        !Number.isSafeInteger(boundary.createdAt) ||
        typeof boundary.id !== 'string'
      )
        throw new Error();
    } catch {
      throw createError({ statusCode: 400, message: 'Invalid history cursor' });
    }
  }
  const rows = db
    .select()
    .from(table)
    .where(
      boundary
        ? or(
            lt(table.createdAt, boundary.createdAt),
            and(
              eq(table.createdAt, boundary.createdAt),
              lt(table.id, boundary.id),
            ),
          )
        : undefined,
    )
    .orderBy(desc(table.createdAt), desc(table.id))
    .limit(limit + 1)
    .all();
  const selected = rows.slice(0, limit);
  const last = selected.at(-1);
  return {
    items: await Promise.all(
      selected.map((row) =>
        kind === 'avatars'
          ? historyItem(
              row as {
                id: string;
                assetUuid: string | null;
                createdAt: number;
              },
              'avatars',
              admin,
            )
          : historyItem(
              row as {
                id: string;
                assetUuid: string | null;
                createdAt: number;
                text: string;
                kind: 'regular' | 'empty';
              },
              'statuses',
              admin,
            ),
      ),
    ),
    total: db.select({ value: count() }).from(table).get()!.value,
    ...(rows.length > limit && last
      ? {
          nextCursor: Buffer.from(
            JSON.stringify({ createdAt: last.createdAt, id: last.id }),
          ).toString('base64url'),
        }
      : {}),
  };
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
    currentAvatar: avatar
      ? await historyItem(avatar, 'avatars', admin)
      : undefined,
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
  const deletedStatuses = ids(input.deletedStatusIds);
  if (!Array.isArray(input.newStatuses) || input.newStatuses.length > 100)
    invalid('Invalid statuses');
  const statuses = input.newStatuses.map((status) => {
    const value = record(status, 'Invalid status');
    const id = ids([value.id])[0]!;
    if (value.kind === 'empty') {
      if (value.assetUuid != null || (value.text != null && value.text !== ''))
        invalid('Invalid empty status');
      return { id, kind: 'empty' as const, text: '', assetUuid: null };
    }
    if (value.kind !== 'regular') invalid('Invalid status kind');
    const statusText = text(value.text, 10000, true);
    const assetUuid = optionalId(value.assetUuid, 'Invalid status media');
    return {
      id,
      kind: 'regular' as const,
      text: statusText,
      assetUuid,
    };
  });
  if (new Set(statuses.map((s) => s.id)).size !== statuses.length)
    invalid('Invalid status');
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
  const newStatusIds = new Set(statuses.map((status) => status.id));
  const storedNewStatuses = newStatusIds.size
    ? db
        .select()
        .from(schema.profileStatuses)
        .where(inArray(schema.profileStatuses.id, [...newStatusIds]))
        .all()
    : [];
  const incomingStatusById = new Map(
    statuses.map((status) => [status.id, status]),
  );
  for (const stored of storedNewStatuses) {
    const incoming = incomingStatusById.get(stored.id)!;
    if (
      stored.kind !== incoming.kind ||
      stored.text !== incoming.text ||
      stored.assetUuid !== incoming.assetUuid
    )
      invalid('Status ID already exists');
  }
  const excludedStatusIds = [...new Set([...deletedStatuses, ...newStatusIds])];
  const currentStatusKind = db
    .select({
      kind: schema.profileStatuses.kind,
    })
    .from(schema.profileStatuses)
    .where(
      excludedStatusIds.length
        ? notInArray(schema.profileStatuses.id, excludedStatusIds)
        : undefined,
    )
    .orderBy(
      desc(schema.profileStatuses.createdAt),
      desc(schema.profileStatuses.id),
    )
    .limit(1)
    .get()?.kind;
  let effectiveStatusKind = currentStatusKind;
  for (const status of statuses) {
    if (deletedStatuses.includes(status.id)) continue;
    if (
      status.kind === 'empty' &&
      !canAppendEmptyProfileStatus(effectiveStatusKind)
    )
      invalid('Cannot append an empty status');
    effectiveStatusKind = status.kind;
  }
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
    ...statuses
      .filter((status) => status.kind === 'regular')
      .map((status) => [status.assetUuid, false]),
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
    for (const id of deletedStatuses) {
      detach('profile-status', id);
      tx.delete(schema.profileStatuses)
        .where(eq(schema.profileStatuses.id, id))
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
    for (const [index, status] of statuses.entries()) {
      if (deletedStatuses.includes(status.id)) continue;
      const existing = tx
        .select()
        .from(schema.profileStatuses)
        .where(eq(schema.profileStatuses.id, status.id))
        .get();
      if (
        existing &&
        (existing.kind !== status.kind ||
          existing.assetUuid !== status.assetUuid ||
          existing.text !== status.text)
      )
        invalid('Status ID already exists');
      tx.insert(schema.profileStatuses)
        .values({ ...status, createdAt: now + index })
        .onConflictDoNothing()
        .run();
      attach(status.assetUuid, 'profile-status', status.id, 'icon');
    }
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
