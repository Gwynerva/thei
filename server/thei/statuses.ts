import { and, count, desc, eq, inArray } from 'drizzle-orm';
import {
  canAppendEmptyStatus,
  compareStatusesNewestFirst,
  statusAssetContainer,
  type NewStatus,
  type StatusEditData,
  type StatusHistoryItem,
  type StatusKind,
  type StatusOwner,
  type UpdatedStatus,
} from '#layers/thei/shared/status';
import type { ProfileHistoryPage } from '#layers/thei/shared/profile';
import type { AssetContainerType } from '#layers/thei/shared/asset';
import { isLifeDay } from '#layers/thei/shared/life';
import {
  buildAdminAssetUrls,
  buildPublicProfileMedia,
  buildPublicProjectStatusMedia,
} from './assets/urls';
import {
  buildHistoryPage,
  decodeHistoryCursor,
  olderThan,
  type HistoryKey,
} from './history-page';
import { utcDayOf } from '#layers/thei/shared/date-range';

export const STATUS_PAGE_SIZE = 30;

/** Reports a rejected edit the way the calling entity saver already does. */
export type StatusInvalid = (message: string) => never;

/** The part of a project a public status icon address is built from. */
type StatusProject = { humanReadableSlug: string; publicId: string };

/**
 * Whether a status belongs to this project. A status icon is served under its
 * project's address and judged by that project's access, so the address must
 * not be able to borrow another project's status.
 */
export function projectStatusExists(
  projectUuid: string,
  statusId: string,
): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  return Boolean(
    db
      .select({ id: schema.statuses.id })
      .from(schema.statuses)
      .where(
        and(
          eq(schema.statuses.id, statusId),
          ownerWhere(schema, { type: 'project', id: projectUuid }),
        ),
      )
      .get(),
  );
}

function ownerWhere(schema: any, owner: StatusOwner) {
  return and(
    eq(schema.statuses.ownerType, owner.type),
    eq(schema.statuses.ownerId, owner.id),
  );
}

async function statusMedia(
  assetUuid: string | null | undefined,
  owner: StatusOwner,
  statusId: string,
  admin: boolean,
  project?: StatusProject | null,
) {
  const asset = assetUuid
    ? await THEI_SERVER.assets.findByUuid(assetUuid)
    : undefined;
  if (!asset) return undefined;
  if (admin) return (await buildAdminAssetUrls(asset)).media;
  if (owner.type === 'profile')
    return buildPublicProfileMedia(asset, 'profile-status', statusId, 'icon');
  if (project === undefined)
    project = await THEI_SERVER.projects.findByUuid(owner.id);
  if (!project) return undefined;
  return buildPublicProjectStatusMedia(project, asset, statusId);
}

/**
 * One status as readers get it.
 *
 * `project` is the owning project when the caller already holds it, so a page
 * of a project's statuses does not look the same project up once per icon;
 * `null` means it was looked up and is gone.
 */
export async function statusHistoryItem(
  row: {
    id: string;
    date: string;
    createdAt: number;
    assetUuid: string | null;
    text: string;
    kind: StatusKind;
  },
  owner: StatusOwner,
  admin = false,
  project?: StatusProject | null,
): Promise<StatusHistoryItem> {
  return {
    id: row.id,
    date: row.date,
    createdAt: row.createdAt,
    kind: row.kind,
    text: row.text,
    ...(admin && row.assetUuid ? { assetUuid: row.assetUuid } : {}),
    media: await statusMedia(row.assetUuid, owner, row.id, admin, project),
  };
}

/** The newest-first order of a history: the day, then the moment written. */
function newestFirst(schema: any) {
  return [
    desc(schema.statuses.date),
    desc(schema.statuses.createdAt),
    desc(schema.statuses.id),
  ];
}

/**
 * A cursor of the day a status was dated by. One handed out before statuses
 * had dates, to a panel still open from the previous release, carries none:
 * its day is then read from the status it names, or taken from `createdAt` as
 * the update dated every status that existed then.
 */
function statusCursor(cursor?: string): HistoryKey | undefined {
  const key = decodeHistoryCursor(cursor);
  if (!key || key.date !== undefined) return key;
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select({ date: schema.statuses.date })
    .from(schema.statuses)
    .where(eq(schema.statuses.id, key.id))
    .get();
  return {
    ...key,
    date: row?.date ?? utcDayOf(key.createdAt),
  };
}

/** One page of an owner's statuses, newest first. */
export async function getStatusHistory(
  owner: StatusOwner,
  cursor?: string,
  admin = false,
  limit = STATUS_PAGE_SIZE,
): Promise<ProfileHistoryPage<StatusHistoryItem>> {
  const { db, schema } = THEI_SERVER.useDb();
  const scope = ownerWhere(schema, owner);
  const rows = db
    .select()
    .from(schema.statuses)
    .where(and(scope, olderThan(schema.statuses, statusCursor(cursor))))
    .orderBy(...newestFirst(schema))
    .limit(limit + 1)
    .all();
  const project =
    owner.type === 'project' && !admin && rows.some((row) => row.assetUuid)
      ? ((await THEI_SERVER.projects.findByUuid(owner.id)) ?? null)
      : undefined;
  return buildHistoryPage(
    rows,
    limit,
    db.select({ value: count() }).from(schema.statuses).where(scope).get()!
      .value,
    (row) => statusHistoryItem(row, owner, admin, project),
  );
}

export async function getCurrentStatus(owner: StatusOwner, admin = false) {
  const page = await getStatusHistory(owner, undefined, admin, 1);
  return { current: page.items[0], total: page.total };
}

type StoredStatus = {
  ownerType: string;
  ownerId: string;
  kind: StatusKind;
  text: string;
  assetUuid: string | null;
  date: string;
};

/** A resent new status is the stored one only if nothing about it differs. */
function isSameStatus(
  stored: StoredStatus,
  owner: StatusOwner,
  incoming: {
    kind: StatusKind;
    text: string;
    assetUuid: string | null;
    date: string;
  },
) {
  return (
    stored.ownerType === owner.type &&
    stored.ownerId === owner.id &&
    stored.kind === incoming.kind &&
    stored.text === incoming.text &&
    stored.assetUuid === incoming.assetUuid &&
    stored.date === incoming.date
  );
}

/**
 * What a rewrite leaves of a status. Anything to say makes it a regular one,
 * which is how an empty status is filled in. With nothing to say an empty
 * status stays empty, which is only worth a rewrite when it moves to another
 * day; a regular one cannot be emptied this way, so there is no kind for it.
 */
function rewrittenKind(
  stored: { kind: StatusKind; date: string },
  update: { text: string; assetUuid: string | null; date?: string },
): StatusKind | undefined {
  if (update.text || update.assetUuid) return 'regular';
  return stored.kind === 'empty' && update.date && update.date !== stored.date
    ? 'empty'
    : undefined;
}

export type PreparedStatusEdits = {
  owner: StatusOwner;
  created: Array<{
    id: string;
    kind: 'regular' | 'empty';
    text: string;
    assetUuid: string | null;
    date: string;
  }>;
  updated: Array<{
    id: string;
    kind: StatusKind;
    text: string;
    assetUuid: string | null;
    /** Absent when the request kept the stored day. */
    date?: string;
  }>;
  deleted: string[];
  /** Every asset the edits reference, for the caller's own media checks. */
  referencedAssetUuids: string[];
};

/**
 * Validates one owner's status edits and checks them against what is stored.
 *
 * Kept apart from the entity savers because the rules are the status's own:
 * ids are client-chosen so a retry is idempotent, and an empty status may only
 * stand right above a regular one — which has to be judged against the history
 * as it will be *after* every edit in the same request, since a status can now
 * be dated into the middle of it, not as it stands now.
 */
export function prepareStatusEdits(
  owner: StatusOwner,
  input: Partial<StatusEditData>,
  helpers: {
    invalid: StatusInvalid;
    ids: (value: unknown) => string[];
    optionalId: (value: unknown, message: string) => string | null;
  },
): PreparedStatusEdits {
  const { invalid, ids, optionalId } = helpers;
  const { db, schema } = THEI_SERVER.useDb();
  const today = utcDayOf(Date.now());
  const text = (value: unknown): string => {
    if (typeof value !== 'string' || value.length > 10000)
      return invalid('Invalid status');
    return value.trim();
  };
  const date = (value: unknown): string | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string' || !isLifeDay(value))
      return invalid('Invalid status date');
    return value;
  };

  const deleted = ids(input.deletedStatusIds);
  const deletedIds = new Set(deleted);
  // Like the other two lists, a missing one means no edits of that kind.
  const rawNew = input.newStatuses ?? [];
  if (!Array.isArray(rawNew) || rawNew.length > 100)
    invalid('Invalid statuses');
  const created = (rawNew as NewStatus[]).map((status) => {
    if (!status || typeof status !== 'object') invalid('Invalid status');
    const value = status as Record<string, unknown>;
    const id = ids([value.id])[0]!;
    const day = date(value.date) ?? today;
    if (value.kind === 'empty') {
      if (value.assetUuid != null || (value.text != null && value.text !== ''))
        invalid('Invalid empty status');
      return {
        id,
        kind: 'empty' as const,
        text: '',
        assetUuid: null,
        date: day,
      };
    }
    if (value.kind !== 'regular') invalid('Invalid status kind');
    const regular = {
      id,
      kind: 'regular' as const,
      text: text(value.text),
      assetUuid: optionalId(value.assetUuid, 'Invalid status media'),
      date: day,
    };
    // A regular status has to say something, in words or in a picture.
    if (!regular.text && !regular.assetUuid) invalid('Invalid status');
    return regular;
  });
  if (new Set(created.map((s) => s.id)).size !== created.length)
    invalid('Invalid status');

  const rawUpdated = input.updatedStatuses ?? [];
  if (!Array.isArray(rawUpdated) || rawUpdated.length > 100)
    invalid('Invalid statuses');
  const requested = (rawUpdated as UpdatedStatus[])
    .map((status) => {
      if (!status || typeof status !== 'object') invalid('Invalid status');
      const value = status as unknown as Record<string, unknown>;
      const day = date(value.date);
      return {
        id: ids([value.id])[0]!,
        text: text(value.text),
        assetUuid: optionalId(value.assetUuid, 'Invalid status media'),
        ...(day ? { date: day } : {}),
      };
    })
    .filter((status) => !deletedIds.has(status.id));
  const newIds = new Set(created.map((status) => status.id));
  if (
    new Set(requested.map((s) => s.id)).size !== requested.length ||
    requested.some((s) => newIds.has(s.id))
  )
    invalid('Invalid status');

  const scope = ownerWhere(schema, owner);
  // A repeated request must land on the same rows rather than a conflict, so a
  // resent new status is accepted only when it matches the stored one exactly.
  // Ids are global, so the lookup is too: another owner's id is a conflict.
  const incomingById = new Map(created.map((status) => [status.id, status]));
  if (newIds.size)
    for (const stored of db
      .select()
      .from(schema.statuses)
      .where(inArray(schema.statuses.id, [...newIds]))
      .all())
      if (!isSameStatus(stored, owner, incomingById.get(stored.id)!))
        invalid('Status ID already exists');

  // The whole history, as it will be once this request is written. It is the
  // owner's own and runs to hundreds of short rows at most, so the order rule
  // is judged over all of it here rather than in the transaction, where the
  // saver could no longer answer with its own error.
  const history = new Map(
    db
      .select({
        id: schema.statuses.id,
        kind: schema.statuses.kind,
        date: schema.statuses.date,
        createdAt: schema.statuses.createdAt,
      })
      .from(schema.statuses)
      .where(scope)
      .all()
      .filter((row) => !deletedIds.has(row.id) && !newIds.has(row.id))
      .map((row) => [row.id, row]),
  );
  const placed = new Set<string>();
  const updated = requested.map((status) => {
    const stored = history.get(status.id);
    const kind = stored && rewrittenKind(stored, status);
    if (!stored || !kind) return invalid('Invalid status');
    if (status.date && status.date !== stored.date) placed.add(status.id);
    history.set(status.id, {
      ...stored,
      kind,
      date: status.date ?? stored.date,
    });
    return { ...status, kind };
  });
  // Written after everything stored, in the order they came in.
  const now = Date.now();
  for (const [index, status] of created.entries()) {
    if (deletedIds.has(status.id)) continue;
    placed.add(status.id);
    history.set(status.id, {
      id: status.id,
      kind: status.kind,
      date: status.date,
      createdAt: now + index,
    });
  }
  // Only where this request put something: a pair it left alone is as the
  // owner had it, like the one a deletion closes up.
  const ordered = [...history.values()].sort(compareStatusesNewestFirst);
  for (const [index, status] of ordered.entries()) {
    const older = ordered[index + 1];
    if (
      status.kind === 'empty' &&
      (placed.has(status.id) || (older && placed.has(older.id))) &&
      !canAppendEmptyStatus(older?.kind)
    )
      invalid('Cannot append an empty status');
  }

  return {
    owner,
    created,
    updated,
    deleted,
    referencedAssetUuids: [
      ...created
        .filter((status) => status.kind === 'regular')
        .map((status) => status.assetUuid),
      ...updated.map((status) => status.assetUuid),
    ].filter((uuid): uuid is string => Boolean(uuid)),
  };
}

/**
 * Writes prepared edits inside the caller's transaction.
 *
 * `attach` and `detach` belong to the caller because asset reuse counting is
 * the entity saver's business, not this module's.
 */
export function applyStatusEdits(
  tx: any,
  schema: any,
  prepared: PreparedStatusEdits,
  now: number,
  hooks: {
    attach: (
      assetUuid: string | null,
      containerType: AssetContainerType,
      containerId: string,
      role: 'icon',
    ) => void;
    detach: (containerType: AssetContainerType, containerId: string) => void;
    invalid: StatusInvalid;
  },
) {
  const { owner, created, updated, deleted } = prepared;
  const container = statusAssetContainer(owner.type);
  const scope = ownerWhere(schema, owner);
  const deletedIds = new Set(deleted);

  for (const id of deleted) {
    // Only a status this owner really had gives up its icon: the id comes from
    // the request, and another owner's usage row must not be touched.
    const removed = tx
      .delete(schema.statuses)
      .where(and(scope, eq(schema.statuses.id, id)))
      .run().changes;
    if (removed) hooks.detach(container, id);
  }

  for (const [index, status] of created.entries()) {
    if (deletedIds.has(status.id)) continue;
    const existing = tx
      .select()
      .from(schema.statuses)
      .where(eq(schema.statuses.id, status.id))
      .get();
    if (existing && !isSameStatus(existing, owner, status))
      hooks.invalid('Status ID already exists');
    tx.insert(schema.statuses)
      .values({
        ...status,
        ownerType: owner.type,
        ownerId: owner.id,
        // A batch added in one save keeps the order it was written in.
        createdAt: now + index,
      })
      .onConflictDoNothing()
      .run();
    hooks.attach(status.assetUuid, container, status.id, 'icon');
  }

  for (const status of updated) {
    const existing = tx
      .select()
      .from(schema.statuses)
      .where(and(scope, eq(schema.statuses.id, status.id)))
      .get();
    const kind = existing && rewrittenKind(existing, status);
    if (!kind) return hooks.invalid('Invalid status');
    tx.update(schema.statuses)
      .set({
        kind,
        text: status.text,
        assetUuid: status.assetUuid,
        ...(status.date ? { date: status.date } : {}),
      })
      .where(and(scope, eq(schema.statuses.id, status.id)))
      .run();
    hooks.detach(container, status.id);
    hooks.attach(status.assetUuid, container, status.id, 'icon');
  }
}

/**
 * Drops every status of an owner that is being deleted, with their icons'
 * usages, in two statements however long the history is.
 */
export function deleteStatusesForOwner(
  tx: any,
  schema: any,
  owner: StatusOwner,
) {
  tx.delete(schema.assetUsages)
    .where(
      and(
        eq(schema.assetUsages.containerType, statusAssetContainer(owner.type)),
        inArray(
          schema.assetUsages.containerId,
          tx
            .select({ id: schema.statuses.id })
            .from(schema.statuses)
            .where(ownerWhere(schema, owner)),
        ),
      ),
    )
    .run();
  tx.delete(schema.statuses).where(ownerWhere(schema, owner)).run();
}

export class StatusEditError extends Error {}

/**
 * The same preparation for callers that report failures by returning a message
 * rather than throwing an HTTP error, which is how the project savers are
 * written.
 */
export function prepareEntityStatusEdits(
  owner: StatusOwner,
  input: Partial<StatusEditData>,
): PreparedStatusEdits {
  // Declared, not assigned to a const: TypeScript only narrows control flow
  // after a `never`-returning call when it can see the declaration.
  function invalid(message: string): never {
    throw new StatusEditError(message);
  }
  return prepareStatusEdits(owner, input, {
    invalid,
    ids: (value) => {
      if (value === undefined) return [];
      if (!Array.isArray(value) || value.length > 200)
        invalid('Invalid status');
      return value.map((id) => {
        if (typeof id !== 'string' || !id || id.length > 200)
          invalid('Invalid status');
        return id;
      });
    },
    optionalId: (value, message) => {
      if (value === undefined || value === null) return null;
      if (typeof value !== 'string' || !value || value.length > 200)
        invalid(message);
      return value;
    },
  });
}

/**
 * The attach/detach pair a status needs, for savers whose own usage helpers are
 * hard-wired to their entity's container.
 */
export function statusUsageHooks(
  tx: any,
  schema: any,
  now: number,
  invalid: StatusInvalid,
) {
  return {
    invalid,
    detach(containerType: AssetContainerType, containerId: string) {
      tx.delete(schema.assetUsages)
        .where(
          and(
            eq(schema.assetUsages.containerType, containerType),
            eq(schema.assetUsages.containerId, containerId),
          ),
        )
        .run();
    },
    attach(
      assetUuid: string | null,
      containerType: AssetContainerType,
      containerId: string,
      role: 'icon',
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
    },
  };
}
