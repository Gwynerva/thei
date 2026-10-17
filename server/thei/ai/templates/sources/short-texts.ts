import { inArray } from 'drizzle-orm';
import { PROFILE_ID } from '#layers/thei/shared/profile';
import { refOf, type EntityKey, type EntityKind } from '../../../entity-kinds';
import { inScope } from './scope';

/**
 * The short texts the owner types beside an entity's own texts — its title
 * and summary, its reminder, what a dated stretch is called, its status
 * lines, the notes on its links and relations, the titles and captions of
 * the files placed on it, the owner's name and slogan, a project's button —
 * each with the area it belongs to and how a model changes it. Names a page
 * is found by, slugs and addresses are not words to proofread, and are
 * left out.
 */

export interface ShortText {
  /** What it is among the entity's own, stable while it stands: `title`, `status:<id>`. */
  key: string;
  area: string;
  /** How it is named to the model. */
  label: string;
  value: string;
}

export interface EntityShortTexts {
  key: EntityKey;
  /** When it last changed, to take the latest first. */
  at: number;
  texts: ShortText[];
}

/** Every entity's short texts, by `kind:id`; of the scope's only, when given. */
export function shortTexts(
  scope?: readonly EntityKey[],
): Map<string, EntityShortTexts> {
  const { db, schema } = THEI_SERVER.useDb();
  const byEntity = new Map<string, EntityShortTexts>();
  const add = (
    owner: EntityKey,
    at: number,
    text: Omit<ShortText, 'value'> & { value: string | null | undefined },
  ) => {
    const value = text.value?.trim();
    if (!value || !inScope(scope, owner)) return;
    const id = `${owner.kind}:${owner.id}`;
    let entry = byEntity.get(id);
    if (!entry) byEntity.set(id, (entry = { key: owner, at, texts: [] }));
    entry.at = Math.max(entry.at, at);
    entry.texts.push({ ...text, value });
  };
  const own = (kind: EntityKind, id: string) => ({ kind, id });

  const projects = db.select().from(schema.projects).all();
  const projectAt = new Map(
    projects.map((row) => [row.projectUuid, row.updatedAt]),
  );
  for (const row of projects) {
    const key = own('project', row.projectUuid);
    add(key, row.updatedAt, {
      key: 'title',
      area: 'titles',
      label: 'title',
      value: row.title,
    });
    add(key, row.updatedAt, {
      key: 'summary',
      area: 'summaries',
      label: 'summary',
      value: row.summary,
    });
    add(key, row.updatedAt, {
      key: 'reminder',
      area: 'reminders',
      label: 'reminder',
      value: row.reminder,
    });
    if (row.action?.enabled)
      add(key, row.updatedAt, {
        key: 'action',
        area: 'action',
        label: 'actionText (its button)',
        value: row.action.text,
      });
  }
  for (const row of db.select().from(schema.projectContentSections).all()) {
    const key = own('project-section', row.sectionUuid);
    add(key, row.updatedAt, {
      key: 'title',
      area: 'titles',
      label: 'title',
      value: row.title,
    });
    add(key, row.updatedAt, {
      key: 'summary',
      area: 'summaries',
      label: 'summary',
      value: row.summary,
    });
  }
  const events = db.select().from(schema.events).all();
  const eventAt = new Map(events.map((row) => [row.eventUuid, row.updatedAt]));
  for (const row of events) {
    const key = own('event', row.eventUuid);
    add(key, row.updatedAt, {
      key: 'title',
      area: 'titles',
      label: 'title',
      value: row.title,
    });
    add(key, row.updatedAt, {
      key: 'summary',
      area: 'summaries',
      label: 'summary',
      value: row.summary,
    });
    add(key, row.updatedAt, {
      key: 'reminder',
      area: 'reminders',
      label: 'reminder',
      value: row.reminder,
    });
  }
  for (const row of db.select().from(schema.pages).all()) {
    const key = own('page', row.pageUuid);
    add(key, row.updatedAt, {
      key: 'title',
      area: 'titles',
      label: 'title',
      value: row.title,
    });
    add(key, row.updatedAt, {
      key: 'summary',
      area: 'summaries',
      label: 'summary',
      value: row.summary,
    });
    add(key, row.updatedAt, {
      key: 'reminder',
      area: 'reminders',
      label: 'reminder',
      value: row.reminder,
    });
  }
  const diaryAt = new Map<string, { at: number; date: string }>();
  for (const row of db.select().from(schema.diaryEntries).all()) {
    diaryAt.set(row.diaryUuid, { at: row.updatedAt, date: row.date });
    add(
      { kind: 'diary-entry', id: row.diaryUuid, date: row.date },
      row.updatedAt,
      {
        key: 'reminder',
        area: 'reminders',
        label: 'reminder',
        value: row.reminder,
      },
    );
  }
  for (const row of db.select().from(schema.tags).all()) {
    const key = own('tag', row.tagUuid);
    add(key, row.updatedAt, {
      key: 'title',
      area: 'titles',
      label: 'title',
      value: row.title,
    });
    add(key, row.updatedAt, {
      key: 'description',
      area: 'summaries',
      label: 'description',
      value: row.description,
    });
  }
  const profile = db.select().from(schema.profiles).get();
  const profileKey = own('profile', PROFILE_ID);
  const profileAt = profile?.updatedAt ?? 0;
  if (profile)
    for (const field of ['displayName', 'nickname', 'slogan'] as const)
      add(profileKey, profileAt, {
        key: field,
        area: 'profile',
        label: field,
        value: profile[field],
      });

  /** When an entity of a kind changed, for the lines that are not its own rows. */
  const atOf = (kind: string, id: string) =>
    kind === 'project'
      ? (projectAt.get(id) ?? 0)
      : kind === 'event'
        ? (eventAt.get(id) ?? 0)
        : kind === 'diary-entry'
          ? (diaryAt.get(id)?.at ?? 0)
          : kind === 'profile'
            ? profileAt
            : 0;
  const keyOf = (kind: string, id: string): EntityKey =>
    kind === 'diary-entry'
      ? { kind, id, date: diaryAt.get(id)?.date }
      : { kind: kind as EntityKind, id };

  for (const row of db.select().from(schema.periods).all()) {
    const key = own(row.ownerType as EntityKind, row.ownerId);
    const at = atOf(row.ownerType, row.ownerId);
    const which = `${row.startDate}…${row.endDate}`;
    add(key, at, {
      key: `period:${which}:label`,
      area: 'periods',
      label: `periods ${which}: label`,
      value: row.label,
    });
    add(key, at, {
      key: `period:${which}:note`,
      area: 'periods',
      label: `periods ${which}: precisionNote`,
      value: row.precisionNote,
    });
  }
  for (const row of db.select().from(schema.statuses).all())
    if (row.kind === 'regular')
      add(keyOf(row.ownerType, row.ownerId), atOf(row.ownerType, row.ownerId), {
        key: `status:${row.id}`,
        area: 'statuses',
        label: `statuses ${row.id} (${row.date})`,
        value: row.text,
      });
  for (const row of db.select().from(schema.projectExternalLinks).all())
    add(own('project', row.projectUuid), atOf('project', row.projectUuid), {
      key: `link:${row.url}`,
      area: 'links',
      label: `links ${row.url}: note`,
      value: row.note,
    });
  for (const row of db.select().from(schema.eventExternalLinks).all())
    add(own('event', row.eventUuid), atOf('event', row.eventUuid), {
      key: `link:${row.url}`,
      area: 'links',
      label: `links ${row.url}: note`,
      value: row.note,
    });
  for (const row of db.select().from(schema.profileExternalLinks).all()) {
    add(profileKey, profileAt, {
      key: `link:${row.url}:name`,
      area: 'links',
      label: `links ${row.url}: name`,
      value: row.name,
    });
    add(profileKey, profileAt, {
      key: `link:${row.url}`,
      area: 'links',
      label: `links ${row.url}: note`,
      value: row.note,
    });
  }
  // A note both ends share is read on the first; each end's own, on it.
  for (const row of db.select().from(schema.entityRelations).all()) {
    const first = keyOf(row.firstType, row.firstId);
    const second = keyOf(row.secondType, row.secondId);
    const note = row.note;
    if (note?.type === 'shared')
      add(first, atOf(first.kind, first.id), {
        key: `relation:${refOf(second)}`,
        area: 'relations',
        label: `relations ${refOf(second)}: note`,
        value: note.text,
      });
    else if (note?.type === 'split') {
      add(first, atOf(first.kind, first.id), {
        key: `relation:${refOf(second)}`,
        area: 'relations',
        label: `relations ${refOf(second)}: notes.this`,
        value: note.firstText,
      });
      add(second, atOf(second.kind, second.id), {
        key: `relation:${refOf(first)}`,
        area: 'relations',
        label: `relations ${refOf(first)}: notes.this`,
        value: note.secondText,
      });
    }
  }
  for (const row of db
    .select()
    .from(schema.assetUsages)
    .where(inArray(schema.assetUsages.role, ['showcase-asset', 'other-asset']))
    .all()) {
    const meta = (row.meta ?? {}) as { title?: string; caption?: string };
    const kind = row.containerType as string;
    if (kind !== 'project' && kind !== 'event') continue;
    const list = row.role === 'showcase-asset' ? 'showcaseFiles' : 'files';
    const key = own(kind, row.containerId);
    const at = atOf(kind, row.containerId);
    add(key, at, {
      key: `file:${list}:${row.assetUuid}:title`,
      area: 'captions',
      label: `${list} ${row.assetUuid}: title`,
      value: meta.title,
    });
    add(key, at, {
      key: `file:${list}:${row.assetUuid}:caption`,
      area: 'captions',
      label: `${list} ${row.assetUuid}: caption`,
      value: meta.caption,
    });
  }
  return byEntity;
}

/**
 * The keys of an entity's short texts an action changed: a field it set, or
 * every line of a list it gave whole.
 */
export function touchedKeys(
  kind: string,
  payload: Record<string, unknown>,
): (key: string) => boolean {
  const fields =
    kind === 'field'
      ? [String(payload.field)]
      : kind === 'periods'
        ? ['periods']
        : kind === 'update'
          ? Object.keys((payload.changes ?? {}) as Record<string, unknown>)
          : [];
  const statuses = new Set(
    (
      ((payload.changes as Record<string, unknown> | undefined)?.statuses ??
        []) as { id?: unknown }[]
    ).map((item) => `status:${String(item?.id)}`),
  );
  return (key) =>
    fields.some((field) => {
      switch (field) {
        case 'actionText':
          return key === 'action';
        case 'statuses':
          return statuses.has(key);
        case 'periods':
          return key.startsWith('period:');
        case 'links':
          return key.startsWith('link:');
        case 'relations':
          return key.startsWith('relation:');
        case 'files':
          return key.startsWith('file:files:');
        case 'showcaseFiles':
          return key.startsWith('file:showcaseFiles:');
        default:
          return key === field;
      }
    });
}
