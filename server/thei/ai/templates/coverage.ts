import { and, eq, inArray } from 'drizzle-orm';
import {
  AI_BUILTIN_TEMPLATE_KEYS,
  builtinTemplateId,
} from '#layers/thei/shared/ai-template';
import type { AiEntityType } from '#layers/thei/shared/ai';
import { findActions } from '../actions/rows';
import { TEMPLATE_SOURCES, type CheckItem, type Covered } from './sources';

/**
 * What each built-in check has looked at, kept by the code rather than left
 * to a model's memory. A run is given what is due, and holds it while its
 * turn runs, so two runs never look at the same; once the turn went through,
 * what it was given counts as looked at, as it read then. A failed turn lets
 * it go. An action the owner applies leaves what it mended looked at too.
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
 * meanwhile is left out. Returns what it was given.
 */
export function holdBatch(
  tx: any,
  schema: any,
  templateId: string,
  sessionUuid: string,
  batch: readonly CheckItem[],
): CheckItem[] {
  const busy = busySubjects(templateId, tx);
  const free = batch.filter((item) => !busy.has(item.subject));
  if (free.length)
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
  return free;
}

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
) {
  for (const row of rows)
    tx.insert(schema.aiTemplateCoverage)
      .values({ templateId, ...row, at: now })
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
          at: now,
        },
      })
      .run();
}

/**
 * A turn of a session is over: what a check's run was given counts as
 * looked at if the turn went through, and is let go either way.
 */
export function settleTemplateTurn(
  sessionUuid: string,
  wentThrough: boolean,
  now = Date.now(),
) {
  const { db, schema } = THEI_SERVER.useDb();
  const table = schema.aiTemplateBatches;
  db.transaction((tx) => {
    const held = tx
      .select()
      .from(table)
      .where(eq(table.sessionUuid, sessionUuid))
      .all() as (typeof table.$inferSelect)[];
    if (!held.length) return;
    if (wentThrough) {
      const byTemplate = new Map<string, typeof held>();
      for (const row of held)
        byTemplate.set(row.templateId, [
          ...(byTemplate.get(row.templateId) ?? []),
          row,
        ]);
      for (const [templateId, rows] of byTemplate)
        cover(tx, schema, templateId, rows, now);
    }
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
    const rows = findActions([...actionUuids]);
    const { db, schema } = THEI_SERVER.useDb();
    for (const key of AI_BUILTIN_TEMPLATE_KEYS) {
      const source = TEMPLATE_SOURCES[key];
      if (!source.coveredBy) continue;
      const templateId = builtinTemplateId(key);
      // Read only for an action this check counts.
      let kept: Map<string, Covered> | undefined;
      const items = rows.flatMap((row) =>
        source.coveredBy!(row, (subject) =>
          (kept ??= coverageOf(templateId)).get(subject),
        ),
      );
      if (items.length)
        db.transaction((tx) =>
          cover(
            tx,
            schema,
            templateId,
            items.map((item) => ({
              subject: item.subject,
              ...entityColumns(item),
              fingerprint: item.fingerprint,
              parts: item.parts,
            })),
            now,
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

/** Lets go of what runs of these sessions were given: they are gone. */
export function dropBatches(tx: any, schema: any, sessionUuids: string[]) {
  if (!sessionUuids.length) return;
  tx.delete(schema.aiTemplateBatches)
    .where(inArray(schema.aiTemplateBatches.sessionUuid, sessionUuids))
    .run();
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
