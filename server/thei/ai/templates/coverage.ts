import { and, count, eq, inArray } from 'drizzle-orm';
import {
  AI_BUILTIN_TEMPLATE_KEYS,
  builtinTemplateId,
} from '#layers/thei/shared/ai-template';
import type { AiEntityType } from '#layers/thei/shared/ai';
import { findActions, sessionActions } from '../actions/rows';
import type { ActionRow } from '../actions/types';
import { linkSessionEntities } from '../sessions/store';
import { TEMPLATE_SOURCES, type CheckItem, type Covered } from './sources';

/**
 * What each built-in check has looked at, kept by the code rather than left
 * to a model's memory. A run is given what is due, and holds it while its
 * turn runs, so two runs never look at the same; once the turn went through,
 * or its model asked for the next batch, what it was given counts as looked
 * at, as it read then, by its session. A turn that failed keeps only what it
 * proposed something for. An action the owner applies leaves what it mended
 * looked at too, by no session.
 */

type CoverageRow =
  typeof import('../../db/schema/ai').aiTemplateCoverage.$inferSelect;

/** What a check has looked at, by subject. */
export function coverageOf(templateId: string): Map<string, Covered> {
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.aiTemplateCoverage)
    .where(eq(schema.aiTemplateCoverage.templateId, templateId))
    .all() as CoverageRow[];
  return new Map(
    rows.map((row) => [
      row.subject,
      { fingerprint: row.fingerprint, parts: row.parts },
    ]),
  );
}

/**
 * How many subjects a check has looked at — in all, or in one session's
 * runs: one count, never a read of what is left, which over a whole
 * archive would hold the server up. A session counts only what its own runs
 * were given, never another's, nor what a fix applied in a form mended.
 */
export function coveredCount(templateId: string, sessionUuid?: string): number {
  const { db, schema } = THEI_SERVER.useDb();
  const table = schema.aiTemplateCoverage;
  return (
    db
      .select({ count: count() })
      .from(table)
      .where(
        and(
          eq(table.templateId, templateId),
          sessionUuid ? eq(table.sessionUuid, sessionUuid) : undefined,
        ),
      )
      .get()?.count ?? 0
  );
}

/** The subjects runs of a check hold now. */
export function busySubjects(templateId: string, tx?: any): Set<string> {
  const { db, schema } = THEI_SERVER.useDb();
  return new Set(
    (tx ?? db)
      .select({ subject: schema.aiTemplateBatches.subject })
      .from(schema.aiTemplateBatches)
      .where(eq(schema.aiTemplateBatches.templateId, templateId))
      .all()
      .map((row: { subject: string }) => row.subject),
  );
}

/** What a subject is forgotten with: its entity, or its family of files. */
function entityColumns(item: Pick<CheckItem, 'entity' | 'family'>) {
  if (item.family)
    return { entityType: 'asset' as const, entityId: item.family };
  return {
    entityType: (item.entity?.kind as AiEntityType | undefined) ?? null,
    entityId: item.entity?.id ?? null,
  };
}

/**
 * Gives a run what it is to look at, inside `tx`: what another run took
 * meanwhile is left out. The entities it is given are what its session is
 * about — given at once or when its model asks. Returns what it was given.
 */
export function holdBatch(
  tx: any,
  schema: any,
  templateId: string,
  sessionUuid: string,
  batch: readonly CheckItem[],
  now = Date.now(),
): CheckItem[] {
  const busy = busySubjects(templateId, tx);
  const free = batch.filter((item) => !busy.has(item.subject));
  if (!free.length) return free;
  tx.insert(schema.aiTemplateBatches)
    .values(
      free.map((item) => ({
        sessionUuid,
        templateId,
        subject: item.subject,
        ...entityColumns(item),
        fingerprint: item.fingerprint,
        parts: item.parts,
      })),
    )
    .run();
  linkSessionEntities(
    tx,
    schema,
    sessionUuid,
    [
      ...new Map(
        free.flatMap((item) =>
          item.entity
            ? [[`${item.entity.kind}:${item.entity.id}`, item.entity]]
            : [],
        ),
      ).values(),
    ].map((entity) => ({
      type: entity.kind as AiEntityType,
      id: entity.id,
      role: 'about' as const,
    })),
    now,
  );
  return free;
}

/**
 * Keeps subjects as looked at. A session's run makes them its own; a fix
 * applied (`sessionUuid` none) leaves them with the run that looked at them.
 */
function cover(
  tx: any,
  schema: any,
  templateId: string,
  rows: readonly (Covered & {
    subject: string;
    entityType: AiEntityType | null;
    entityId: string | null;
  })[],
  now: number,
  sessionUuid: string | null,
) {
  for (const row of rows)
    tx.insert(schema.aiTemplateCoverage)
      .values({
        templateId,
        subject: row.subject,
        entityType: row.entityType,
        entityId: row.entityId,
        fingerprint: row.fingerprint,
        parts: row.parts,
        sessionUuid,
        at: now,
      })
      .onConflictDoUpdate({
        target: [
          schema.aiTemplateCoverage.templateId,
          schema.aiTemplateCoverage.subject,
        ],
        set: {
          entityType: row.entityType,
          entityId: row.entityId,
          fingerprint: row.fingerprint,
          parts: row.parts,
          ...(sessionUuid ? { sessionUuid } : {}),
          at: now,
        },
      })
      .run();
}

type HeldRow =
  typeof import('../../db/schema/ai').aiTemplateBatches.$inferSelect;

/**
 * Whether a run proposed something for what it was given: an action about
 * the subject's entity, or a description of its family of files.
 */
function workedOn(row: HeldRow, actions: readonly ActionRow[]): boolean {
  return actions.some(
    (action) =>
      (action.targetType === row.entityType &&
        action.targetId === row.entityId) ||
      (row.entityType === 'asset' &&
        (action.payload as { family?: unknown } | null)?.family ===
          row.entityId),
  );
}

/**
 * What a check's run holds is settled: counted as looked at — as it read
 * then — if the run went through, and let go either way. A run stopped
 * midway keeps as looked at what it proposed something for; the rest waits
 * for the next. A new batch asked for within a turn settles the ones before
 * it the same way, the run having gone through them.
 */
export function settleTemplateTurn(
  sessionUuid: string,
  wentThrough: boolean,
  now = Date.now(),
) {
  const { db, schema } = THEI_SERVER.useDb();
  const table = schema.aiTemplateBatches;
  const actions = wentThrough ? [] : sessionActions(sessionUuid);
  db.transaction((tx) => {
    const held = tx
      .select()
      .from(table)
      .where(eq(table.sessionUuid, sessionUuid))
      .all() as HeldRow[];
    if (!held.length) return;
    const byTemplate = new Map<string, HeldRow[]>();
    for (const row of held)
      if (wentThrough || workedOn(row, actions))
        byTemplate.set(row.templateId, [
          ...(byTemplate.get(row.templateId) ?? []),
          row,
        ]);
    for (const [templateId, rows] of byTemplate)
      cover(tx, schema, templateId, rows, now, sessionUuid);
    tx.delete(table).where(eq(table.sessionUuid, sessionUuid)).run();
  });
}

/**
 * Actions just applied — in a session, in the editor, or found done by the
 * owner's hand: what each mended counts as looked at by the check that looks
 * at such things, so its own accepted fix does not hand the same back to it.
 */
export function coverApplied(actionUuids: readonly string[], now = Date.now()) {
  if (!actionUuids.length) return;
  try {
    // Only what stands: an action applied, or a text edit some parts of
    // which are — never one overtaken or declined, whose words are the
    // owner's own.
    const rows = findActions([...actionUuids]).filter(
      (row) =>
        row.state === 'applied' ||
        (row.state === 'pending' && row.kind === 'revise'),
    );
    if (!rows.length) return;
    const { db, schema } = THEI_SERVER.useDb();
    for (const key of AI_BUILTIN_TEMPLATE_KEYS) {
      const source = TEMPLATE_SOURCES[key];
      if (!source.coveredBy) continue;
      const templateId = builtinTemplateId(key);
      // Read only for an action this check counts; a subject two of them
      // mend builds on what the one before left.
      let kept: Map<string, Covered> | undefined;
      const items = new Map<string, CheckItem>();
      for (const row of rows)
        for (const item of source.coveredBy(
          row,
          (subject) =>
            items.get(subject) ??
            (kept ??= coverageOf(templateId)).get(subject),
        ))
          items.set(item.subject, item);
      if (items.size)
        db.transaction((tx) =>
          cover(
            tx,
            schema,
            templateId,
            [...items.values()].map((item) => ({
              subject: item.subject,
              ...entityColumns(item),
              fingerprint: item.fingerprint,
              parts: item.parts,
            })),
            now,
            null,
          ),
        );
    }
  } catch (error) {
    THEI_SERVER.console.error(
      '[AI] Failed to keep what an applied action mended as checked:',
      error,
    );
  }
}

/**
 * Forgets what a check looked at of subjects that are no more — a link
 * mended, or taken out of its text — so its rows do not stay for as long as
 * the text does.
 */
export function forgetSubjects(templateId: string, subjects: string[]) {
  if (!subjects.length) return;
  const { db, schema } = THEI_SERVER.useDb();
  const table = schema.aiTemplateCoverage;
  for (let index = 0; index < subjects.length; index += 500)
    db.delete(table)
      .where(
        and(
          eq(table.templateId, templateId),
          inArray(table.subject, subjects.slice(index, index + 500)),
        ),
      )
      .run();
}

/**
 * Forgets all a check has looked at, for it to look at everything from the
 * start: the owner asked it to look again.
 */
export function forgetAll(templateId: string) {
  const { db, schema } = THEI_SERVER.useDb();
  db.delete(schema.aiTemplateCoverage)
    .where(eq(schema.aiTemplateCoverage.templateId, templateId))
    .run();
}

/**
 * Lets go of what runs of these sessions were given, and of what their
 * models last asked for: they are gone.
 */
export function dropBatches(tx: any, schema: any, sessionUuids: string[]) {
  if (!sessionUuids.length) return;
  tx.delete(schema.aiTemplateBatches)
    .where(inArray(schema.aiTemplateBatches.sessionUuid, sessionUuids))
    .run();
  for (const sessionUuid of sessionUuids) asked.delete(sessionUuid);
}

/** What checks looked at of deleted entities, forgotten with them in `tx`. */
export function forgetCoverage(
  tx: any,
  schema: any,
  type: string,
  ids: string[],
) {
  for (const table of [schema.aiTemplateCoverage, schema.aiTemplateBatches])
    tx.delete(table)
      .where(and(eq(table.entityType, type), inArray(table.entityId, ids)))
      .run();
}

/**
 * What a run's model last asked for: the areas and refs, and the number of
 * subjects it asked for.
 */
interface Asked {
  areas?: string[];
  refs?: string[];
  count?: number;
}
const asked = new Map<string, Asked>();

/**
 * What a run's model last asked `check_batch` for, kept for «go on»: the
 * next batch is of the same. Kept in memory: after a restart the run goes
 * on over all it is about.
 */
export function rememberAsked(sessionUuid: string, ask: Asked) {
  asked.set(sessionUuid, ask);
}

export function lastAsked(sessionUuid: string) {
  return asked.get(sessionUuid);
}
