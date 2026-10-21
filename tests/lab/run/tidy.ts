// Leaves the site as a play found it, through the admin's own routes: what
// the play made is deleted, forms it may have changed are saved back as they
// were read, and whatever cannot be put back is named. `lab up lab` is the
// real reset; this keeps plays from leaking into one another between resets.
//
// Only what the play made goes: what it said it made, and what was made
// while it ran. On the playground the site holds the owner's and other
// agents' things too, which the index does not know and which are never
// swept for that alone.
import type { Ref, SiteIndex } from '../types';
import type { SiteClient } from '../archive/site-client';

const KINDS = {
  project: { route: '/api/admin/projects', uuidKey: 'projectUuid' },
  event: { route: '/api/admin/events', uuidKey: 'eventUuid' },
  diary: { route: '/api/admin/diary', uuidKey: 'diaryUuid' },
  page: { route: '/api/admin/pages', uuidKey: 'pageUuid' },
} as const;

export type MadeKind = keyof typeof KINDS | 'tag';

export interface Made {
  kind: MadeKind;
  uuid: string;
}

/** What tidying asks of a site: the admin's routes. */
export type TidySite = Pick<SiteClient, 'request' | 'ok'>;

type FormRoute = { path: string; ref: Ref };

function formRoute(index: SiteIndex, ref: Ref): FormRoute | undefined {
  const entity = index.entities[ref];
  if (!entity) return undefined;
  if (entity.kind === 'profile') return { path: '/api/admin/about', ref };
  if (entity.kind === 'section') return formRoute(index, entity.project!);
  if (entity.kind === 'tag')
    return { path: `/api/admin/tags/${entity.uuid}`, ref };
  const kind = KINDS[entity.kind as keyof typeof KINDS];
  return kind ? { path: `${kind.route}/${entity.uuid}`, ref } : undefined;
}

export interface TidyBefore {
  forms: { path: string; ref: Ref; form: any }[];
}

/** Reads the forms a play may change, before it starts. */
export async function readTouched(
  site: TidySite,
  index: SiteIndex,
  refs: Ref[],
): Promise<TidyBefore> {
  const seen = new Set<string>();
  const forms: TidyBefore['forms'] = [];
  for (const ref of refs) {
    const route = formRoute(index, ref);
    if (!route || seen.has(route.path)) continue;
    seen.add(route.path);
    const answer = site.ok(
      `Reading ${ref}`,
      await site.request('GET', route.path),
    );
    forms.push({ ...route, form: answer.body });
  }
  return { forms };
}

/** Uuids of every entity the index knows: what the site was seeded with. */
function knownUuids(index: SiteIndex) {
  const known = new Set<string>();
  for (const entity of Object.values(index.entities)) known.add(entity.uuid);
  return known;
}

export interface TidySelection {
  /** What the play said it made. */
  created: Made[];
  /** The newest of each list, as the admin lists them. */
  lists: Partial<Record<keyof typeof KINDS, Record<string, unknown>[]>>;
  known: Set<string>;
  /** When the play started, in ms: what was made since is the play's. */
  since: number;
}

/**
 * What a play leaves to be deleted: what it said it made, and each entity
 * of the lists made at or after its start. Never anything the index knows,
 * and never a tag the play did not name: a tag list says nothing of when.
 */
export function selectMade(selection: TidySelection): Made[] {
  const doomed = new Map<string, Made>();
  for (const item of selection.created)
    if (!selection.known.has(item.uuid)) doomed.set(item.uuid, item);
  for (const [kind, { uuidKey }] of Object.entries(KINDS) as [
    keyof typeof KINDS,
    (typeof KINDS)[keyof typeof KINDS],
  ][])
    for (const item of selection.lists[kind] ?? []) {
      const uuid = item[uuidKey];
      const createdAt = Number(item.createdAt);
      if (
        typeof uuid === 'string' &&
        !selection.known.has(uuid) &&
        Number.isFinite(createdAt) &&
        createdAt >= selection.since
      )
        doomed.set(uuid, { kind, uuid });
    }
  return [...doomed.values()];
}

export async function tidy(
  site: TidySite,
  index: SiteIndex,
  before: TidyBefore,
  made: { created: Made[]; since: number },
) {
  const deleted: string[] = [];
  const restored: string[] = [];
  const leftovers: string[] = [];

  const lists: TidySelection['lists'] = {};
  for (const [kind, { route }] of Object.entries(KINDS) as [
    keyof typeof KINDS,
    (typeof KINDS)[keyof typeof KINDS],
  ][]) {
    const answer = await site.request(
      'GET',
      `${route}?order=newest&pageSize=50`,
    );
    if (answer.status === 200) lists[kind] = answer.body?.items ?? [];
  }
  for (const item of selectMade({
    created: made.created,
    lists,
    known: knownUuids(index),
    since: made.since,
  })) {
    const route =
      item.kind === 'tag' ? '/api/admin/tags' : KINDS[item.kind].route;
    const answer = await site.request('DELETE', `${route}/${item.uuid}`);
    if (answer.status < 300) deleted.push(`${item.kind} ${item.uuid}`);
    else
      leftovers.push(
        `${item.kind} ${item.uuid} could not be deleted (${answer.status})`,
      );
  }

  // Forms back as they were read, when they read otherwise now.
  for (const { path, ref, form } of before.forms) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const answer = await site.request('GET', path);
      if (answer.status !== 200) {
        leftovers.push(`${ref} could not be read back (${answer.status})`);
        break;
      }
      const current =
        path === '/api/admin/about' ? answer.body.data : answer.body;
      const saved = path === '/api/admin/about' ? form.data : form;
      if (current.version === saved.version) break;
      const { statuses: _history, ...rest } = saved;
      const payload = {
        ...rest,
        ...('newStatuses' in current ||
        path === '/api/admin/about' ||
        path.startsWith('/api/admin/projects/')
          ? { newStatuses: [], updatedStatuses: [], deletedStatusIds: [] }
          : {}),
        version: current.version,
      };
      const put = await site.request('PUT', path, { json: payload });
      if (put.status === 409 || put.body?.code === 'changed') continue;
      if (put.status === 200) restored.push(ref);
      else
        leftovers.push(
          `${ref} could not be put back (${put.status} ${String(put.body?.message ?? '').slice(0, 120)})`,
        );
      break;
    }
  }
  return { deleted, restored, leftovers };
}
