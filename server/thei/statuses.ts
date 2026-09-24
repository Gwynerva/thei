import { and, asc, count, desc, eq, inArray, notInArray } from 'drizzle-orm';
import {
  canAppendEmptyStatus,
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
import {
  buildAdminAssetUrls,
  buildPublicProfileMedia,
  buildPublicProjectStatusMedia,
} from './assets/urls';
import {
  buildHistoryPage,
  decodeHistoryCursor,
  olderThan,
} from './history-page';

export const STATUS_PAGE_SIZE = 30;

/** Reports a rejected edit the way the calling entity saver already does. */
export type StatusInvalid = (message: string) => never;

/** The part of a project a public status icon address is built from. */
type StatusProject = { humanReadableSlug: string; publicId: string };

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
    createdAt: row.createdAt,
    kind: row.kind,
    text: row.text,
    ...(admin && row.assetUuid ? { assetUuid: row.assetUuid } : {}),
    media: await statusMedia(row.assetUuid, owner, row.id, admin, project),
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
    .where(and(scope, olderThan(schema.statuses, decodeHistoryCursor(cursor))))
    .orderBy(desc(schema.statuses.createdAt), desc(schema.statuses.id))
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
  return {
    current: page.items[0],
    total: page.total,
    firstAt: firstStatusAt(owner),
  };
}

/** The day the owner's oldest status was set, for "key dates" summaries. */
function firstStatusAt(owner: StatusOwner): string | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  const row = db
    .select({ createdAt: schema.statuses.createdAt })
    .from(schema.statuses)
    .where(
      and(
        eq(schema.statuses.ownerType, owner.type),
        eq(schema.statuses.ownerId, owner.id),
      ),
    )
    .orderBy(asc(schema.statuses.createdAt))
    .limit(1)
    .get();
  return row ? new Date(row.createdAt).toISOString().slice(0, 10) : undefined;
}

type StoredStatus = {
  ownerType: string;
  ownerId: string;
  kind: StatusKind;
  text: string;
  assetUuid: string | null;
};

/** A resent new status is the stored one only if nothing about it differs. */
function isSameStatus(
  stored: StoredStatus,
  owner: StatusOwner,
  incoming: { kind: StatusKind; text: string; assetUuid: string | null },
) {
  return (
    stored.ownerType === owner.type &&
    stored.ownerId === owner.id &&
    stored.kind === incoming.kind &&
    stored.text === incoming.text &&
    stored.assetUuid === incoming.assetUuid
  );
}

/**
 * A rewrite keeps a status's date. Filling in an empty status turns it into a
 * regular one, which only ever removes an empty status and so cannot break the
 * order rule — but it has to leave something to say.
 */
function canRewriteStatus(
  kind: StatusKind,
  update: { text: string; assetUuid: string | null },
) {
  return kind === 'regular' || Boolean(update.text || update.assetUuid);
}

export type PreparedStatusEdits = {
  owner: StatusOwner;
  created: Array<{
    id: string;
    kind: 'regular' | 'empty';
    text: string;
    assetUuid: string | null;
  }>;
  updated: Array<{ id: string; text: string; assetUuid: string | null }>;
  deleted: string[];
  /** Every asset the edits reference, for the caller's own media checks. */
  referencedAssetUuids: string[];
};

/**
 * Validates one owner's status edits and checks them against what is stored.
 *
 * Kept apart from the entity savers because the rules are the status's own:
 * ids are client-chosen so a retry is idempotent, a rewritten status keeps its
 * date, and an empty status may only follow a regular one — which has to be
 * judged against the history as it will be *after* the deletions in the same
 * request, not as it stands now.
 */
export function prepareStatusEdits(
  owner: StatusOwner,
  input: Partial<StatusEditData>,
  helpers: {
    invalid: StatusInvalid;
    ids: (value: unknown) => string[];
    optionalId: (value: unknown, message: string) => string | null;
    text: (value: unknown, limit: number, allowEmpty?: boolean) => string;
  },
): PreparedStatusEdits {
  const { invalid, ids, optionalId, text } = helpers;
  const { db, schema } = THEI_SERVER.useDb();

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
    if (value.kind === 'empty') {
      if (value.assetUuid != null || (value.text != null && value.text !== ''))
        invalid('Invalid empty status');
      return { id, kind: 'empty' as const, text: '', assetUuid: null };
    }
    if (value.kind !== 'regular') invalid('Invalid status kind');
    return {
      id,
      kind: 'regular' as const,
      text: text(value.text, 10000, true),
      assetUuid: optionalId(value.assetUuid, 'Invalid status media'),
    };
  });
  if (new Set(created.map((s) => s.id)).size !== created.length)
    invalid('Invalid status');

  const rawUpdated = input.updatedStatuses ?? [];
  if (!Array.isArray(rawUpdated) || rawUpdated.length > 100)
    invalid('Invalid statuses');
  const updated = (rawUpdated as UpdatedStatus[])
    .map((status) => {
      if (!status || typeof status !== 'object') invalid('Invalid status');
      const value = status as unknown as Record<string, unknown>;
      return {
        id: ids([value.id])[0]!,
        text: text(value.text, 10000, true),
        assetUuid: optionalId(value.assetUuid, 'Invalid status media'),
      };
    })
    .filter((status) => !deletedIds.has(status.id));
  const newIds = new Set(created.map((status) => status.id));
  if (
    new Set(updated.map((s) => s.id)).size !== updated.length ||
    updated.some((s) => newIds.has(s.id))
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

  // Checked here rather than in the transaction, so the saver can still answer
  // with its own error instead of failing halfway through the write.
  const storedKinds = new Map<string, StatusKind>(
    updated.length
      ? db
          .select({ id: schema.statuses.id, kind: schema.statuses.kind })
          .from(schema.statuses)
          .where(
            and(
              scope,
              inArray(
                schema.statuses.id,
                updated.map((status) => status.id),
              ),
            ),
          )
          .all()
          .map((row) => [row.id, row.kind])
      : [],
  );
  for (const status of updated) {
    const kind = storedKinds.get(status.id);
    if (!kind || !canRewriteStatus(kind, status)) invalid('Invalid status');
  }

  const excluded = [...new Set([...deleted, ...newIds])];
  let effectiveKind = db
    .select({ kind: schema.statuses.kind })
    .from(schema.statuses)
    .where(
      excluded.length
        ? and(scope, notInArray(schema.statuses.id, excluded))
        : scope,
    )
    .orderBy(desc(schema.statuses.createdAt), desc(schema.statuses.id))
    .limit(1)
    .get()?.kind;
  for (const status of created) {
    if (deletedIds.has(status.id)) continue;
    if (status.kind === 'empty' && !canAppendEmptyStatus(effectiveKind))
      invalid('Cannot append an empty status');
    effectiveKind = status.kind;
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
    if (!existing || !canRewriteStatus(existing.kind, status))
      hooks.invalid('Invalid status');
    tx.update(schema.statuses)
      .set({ kind: 'regular', text: status.text, assetUuid: status.assetUuid })
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
    text: (value, limit, allowEmpty = false) => {
      if (
        typeof value !== 'string' ||
        value.length > limit ||
        (!allowEmpty && !value.trim())
      )
        invalid('Invalid status');
      return value.trim();
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
