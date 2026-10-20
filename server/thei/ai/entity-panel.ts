import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import type {
  AiEntityOffer,
  AiEntityPanel,
  AiEntityPartMemory,
  AiOfferPlace,
} from '#layers/thei/shared/ai-entity';
import { entityText, refOf, type EntityKey } from '../entity-kinds';
import type { FORM_FIELDS, FormKind } from './forms/changes';
import { settleActions } from './actions/apply';
import { actionsAbout } from './actions/rows';
import type { ActionRow } from './actions/types';
import { entityMemory } from './memory/read';
import { sessionName, sessionsAbout } from './sessions/store';
import {
  actionItems,
  aiReadiness,
  entityRef,
  listSessions,
} from './sessions/view';
import { TEMPLATE_SOURCES } from './templates/sources';
import { listTemplates } from './templates/store';
import { asksRunning } from './field-ask';

/**
 * What an entity's form shows of the AI, read whole when the form opens and
 * again after it saves: the proposals that wait are settled against the
 * entity first, so one the save carried out reads as applied.
 */

/** How many sessions about it the form's menu names. */
const SESSIONS_SHOWN = 5;

/**
 * Where each kind's form shows a change of one of its fields: at the label
 * of a field the form has for it, or at its head — a list the form edits as
 * a whole, a text, a file, an address. A new field of a form names its
 * place here; `tests/server/ai-actions-contract.test.ts` checks it does.
 */
export const FIELD_PLACES: {
  [K in FormKind]: Record<(typeof FORM_FIELDS)[K][number], AiOfferPlace>;
} = {
  project: {
    title: 'field:title',
    summary: 'field:summary',
    access: 'access',
    showcase: 'field:showcase',
    cv: 'field:cv',
    reminder: 'field:reminder',
    synonyms: 'field:synonyms',
    slug: 'form',
    publicId: 'form',
    icon: 'form',
    banner: 'form',
    showcaseFiles: 'form',
    files: 'form',
    links: 'form',
    tags: 'form',
    relations: 'form',
    description: 'form',
    notes: 'form',
    sections: 'form',
    sectionOrder: 'form',
    statuses: 'form',
    actionText: 'form',
  },
  'project-section': {
    title: 'field:title',
    summary: 'field:summary',
    private: 'form',
    periods: 'periods',
    body: 'form',
    banner: 'form',
    slug: 'form',
    publicId: 'form',
  },
  event: {
    title: 'field:title',
    summary: 'field:summary',
    access: 'access',
    reminder: 'field:reminder',
    synonyms: 'field:synonyms',
    slug: 'form',
    publicId: 'form',
    periods: 'periods',
    banner: 'form',
    files: 'form',
    links: 'form',
    tags: 'form',
    relations: 'form',
    body: 'form',
    notes: 'form',
  },
  'diary-entry': {
    date: 'form',
    access: 'access',
    reminder: 'field:reminder',
    body: 'form',
    notes: 'form',
    relations: 'form',
  },
  page: {
    title: 'field:title',
    summary: 'field:summary',
    access: 'access',
    reminder: 'field:reminder',
    synonyms: 'field:synonyms',
    slug: 'form',
    icon: 'form',
    body: 'form',
    notes: 'form',
  },
  tag: {
    title: 'form',
    description: 'field:description',
    synonyms: 'field:synonyms',
    slug: 'form',
    publicId: 'form',
    icon: 'form',
  },
  profile: {
    displayName: 'form',
    slogan: 'field:slogan',
    nickname: 'form',
    about: 'form',
    banner: 'form',
    favicon: 'form',
    links: 'form',
    statuses: 'form',
  },
};

/** Where the form shows a proposal of this kind. */
function placeOf(row: ActionRow, key: EntityKey): AiOfferPlace {
  const payload = row.payload as {
    field?: string;
    text?: string;
    changes?: Record<string, unknown>;
  };
  switch (row.kind) {
    case 'field':
      return `field:${payload.field}`;
    case 'periods':
    case 'access':
    case 'tags':
      return row.kind;
    case 'relation':
      return 'relations';
    case 'revise': {
      const text = entityText(key.kind, payload.text);
      return text ? `text:${text.slot}` : 'form';
    }
    // A change of one field waits where the field is; of several, at the head.
    case 'update': {
      const fields = Object.keys(payload.changes ?? {});
      const places = FIELD_PLACES[key.kind as FormKind] as
        Record<string, AiOfferPlace> | undefined;
      return (fields.length === 1 && places?.[fields[0]!]) || 'form';
    }
    default:
      return 'form';
  }
}

/**
 * The relations proposed from the other end: a relation is one claim read
 * from either side, so it waits in both forms.
 */
function relationsNaming(key: EntityKey): ActionRow[] {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.aiActions)
    .where(
      and(
        eq(schema.aiActions.kind, 'relation'),
        eq(schema.aiActions.state, 'pending'),
        sql`json_extract(${schema.aiActions.payload}, '$.other') = ${refOf(key)}`,
      ),
    )
    .all() as ActionRow[];
}

async function offersFor(key: EntityKey): Promise<AiEntityOffer[]> {
  return waitingOffers(
    [...actionsAbout(key, ['pending']), ...relationsNaming(key)],
    (row) => placeOf(row, key),
  );
}

/**
 * Proposals as a form shows them, each at its place: settled against the
 * archive first, and only those of sessions not in the archive.
 */
export async function waitingOffers(
  candidates: ActionRow[],
  place: (row: ActionRow) => AiOfferPlace,
): Promise<AiEntityOffer[]> {
  const rows = await settleActions(candidates);
  const pending = rows.filter((row) => row.state === 'pending');
  if (!pending.length) return [];
  const { db, schema } = THEI_SERVER.useDb();
  // What an archived session holds waits for nobody until it is brought back.
  const sessions = new Map(
    db
      .select({
        sessionUuid: schema.aiSessions.sessionUuid,
        title: schema.aiSessions.title,
        client: schema.aiSessions.client,
      })
      .from(schema.aiSessions)
      .where(
        and(
          inArray(schema.aiSessions.sessionUuid, [
            ...new Set(pending.map((row) => row.sessionUuid)),
          ]),
          isNull(schema.aiSessions.archivedAt),
        ),
      )
      .all()
      .map((row) => [row.sessionUuid, sessionName(row)]),
  );
  const waiting = pending.filter((row) => sessions.has(row.sessionUuid));
  const items = await actionItems(waiting);
  return items
    .map((action, index) => ({
      action,
      place: place(waiting[index]!),
      session: {
        sessionUuid: waiting[index]!.sessionUuid,
        title: sessions.get(waiting[index]!.sessionUuid) ?? '',
      },
    }))
    .filter((offer) => !offer.action.never);
}

/** A project's sections the AI remembers things of. */
function partsRemembered(key: EntityKey): AiEntityPartMemory[] {
  if (key.kind !== 'project') return [];
  const { db, schema } = THEI_SERVER.useDb();
  const sections = db
    .select({ id: schema.projectContentSections.sectionUuid })
    .from(schema.projectContentSections)
    .where(eq(schema.projectContentSections.projectUuid, key.id))
    .all()
    .map((row) => row.id);
  if (!sections.length) return [];
  const t = schema.aiMemory;
  return db
    .select({ id: t.anchorId, records: count() })
    .from(t)
    .where(
      and(
        eq(t.anchor, 'entity'),
        eq(t.anchorType, 'project-section'),
        inArray(t.anchorId, sections),
      ),
    )
    .groupBy(t.anchorId)
    .all()
    .map((row) => ({
      entity: entityRef({ kind: 'project-section', id: row.id }),
      count: row.records,
    }));
}

function sessionCount(key: EntityKey): number {
  const about = sessionsAbout([{ type: key.kind as never, id: key.id }]);
  if (!about.length) return 0;
  const { db, schema } = THEI_SERVER.useDb();
  return (
    db
      .select({ total: count() })
      .from(schema.aiSessions)
      .where(inArray(schema.aiSessions.sessionUuid, about))
      .get()?.total ?? 0
  );
}

export async function entityPanel(key: EntityKey): Promise<AiEntityPanel> {
  return {
    memory: entityMemory(key),
    parts: partsRemembered(key),
    offers: await offersFor(key),
    sessions: listSessions({ about: key }).sessions.slice(0, SESSIONS_SHOWN),
    sessionCount: sessionCount(key),
    // Every template is offered, the owner's words narrowing it — but a
    // check on what this kind of entity cannot have.
    templates: listTemplates()
      .filter(
        ({ builtin }) =>
          !builtin ||
          (TEMPLATE_SOURCES[builtin].kinds?.includes(key.kind) ?? true),
      )
      .map(({ templateId, title, instruction, builtin }) => ({
        templateId,
        title,
        instruction,
        ...(builtin ? { builtin } : {}),
      })),
    ...aiFieldState(refOf(key)),
  };
}

/**
 * What a field's ✦ reads, of an entity or a file by its ref: whether a model
 * answers it, what is asked and still answered, and what waits for the
 * owner, for the admin bar's ✦.
 */
export function aiFieldState(
  ref: string,
): Pick<AiEntityPanel, 'modelReady' | 'asking' | 'waiting'> {
  return { ...aiReadiness(), asking: asksRunning(ref) };
}
