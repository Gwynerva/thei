import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import type {
  AiEntityOffer,
  AiEntityPanel,
  AiEntityPartMemory,
  AiOfferPlace,
} from '#layers/thei/shared/ai-entity';
import { entityText, refOf, type EntityKey } from '../entity-kinds';
import { settleActions } from './actions/apply';
import { actionsAbout } from './actions/rows';
import type { ActionRow } from './actions/types';
import { entityMemory } from './memory/read';
import { sessionModel } from './model/settings';
import { sessionName, sessionsAbout } from './sessions/store';
import { actionItems, entityRef, listSessions } from './sessions/view';
import { listTemplates } from './templates/store';

/**
 * What an entity's form shows of the AI, read whole when the form opens and
 * again after it saves: the proposals that wait are settled against the
 * entity first, so one the save carried out reads as applied.
 */

/** How many sessions about it the form's menu names. */
const SESSIONS_SHOWN = 5;

/** Where the form shows a proposal of this kind. */
function placeOf(row: ActionRow, key: EntityKey): AiOfferPlace {
  const payload = (row.payload ?? {}) as { field?: string; text?: string };
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
  const rows = await settleActions([
    ...actionsAbout(key, ['pending']),
    ...relationsNaming(key),
  ]);
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
      place: placeOf(waiting[index]!, key),
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
      .where(
        and(
          inArray(schema.aiSessions.sessionUuid, about),
          isNull(schema.aiSessions.purgedAt),
        ),
      )
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
    templates: listTemplates()
      .filter((template) => (template.offerOn as string[]).includes(key.kind))
      .map(({ templateId, title, instruction, builtin }) => ({
        templateId,
        title,
        instruction,
        ...(builtin ? { builtin } : {}),
      })),
    modelReady: Boolean(sessionModel()),
  };
}
