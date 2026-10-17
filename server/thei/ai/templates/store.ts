import { randomUUID } from 'node:crypto';
import { asc, desc, eq } from 'drizzle-orm';
import {
  AI_BUILTIN_TEMPLATE_KEYS,
  AI_TEMPLATE_INSTRUCTION_MAX,
  AI_TEMPLATE_TITLE_MAX,
  builtinTemplateId,
  type AiBuiltinTemplateKey,
  type AiTemplateItem,
} from '#layers/thei/shared/ai-template';
import { EntityPrefix } from '../../entity-id';
import { refuse as fail } from '../../entity-patch/text';
import { findSession } from '../sessions/store';

/**
 * The templates: the built-in checks, written in the code — the owner sets
 * only which model answers them — and the owner's own ready-made requests,
 * written by the owner. A built-in one's settings are a row under its id,
 * made the first time the owner changes them or runs it.
 */

type TemplateRow = typeof import('../../db/schema/ai').aiTemplates.$inferSelect;

function rowOf(templateId: string): TemplateRow | undefined {
  const { db, schema } = THEI_SERVER.useDb();
  return db
    .select()
    .from(schema.aiTemplates)
    .where(eq(schema.aiTemplates.templateId, templateId))
    .get() as TemplateRow | undefined;
}

function builtinKeyOf(templateId: string): AiBuiltinTemplateKey | undefined {
  return AI_BUILTIN_TEMPLATE_KEYS.find(
    (key) => builtinTemplateId(key) === templateId,
  );
}

/**
 * The latest session a template started: a check's run, kept with its
 * settings, or — for the owner's own ready-made request, never run — the
 * latest session begun from it.
 */
function lastSessionOf(templateId: string, row: TemplateRow | undefined) {
  const { db, schema } = THEI_SERVER.useDb();
  const sessionUuid =
    row?.lastSessionUuid ??
    (
      db
        .select({ sessionUuid: schema.aiSessions.sessionUuid })
        .from(schema.aiSessions)
        .where(eq(schema.aiSessions.templateId, templateId))
        .orderBy(desc(schema.aiSessions.createdAt))
        .limit(1)
        .get() as { sessionUuid: string } | undefined
    )?.sessionUuid;
  const session = sessionUuid ? findSession(sessionUuid) : undefined;
  return session
    ? {
        lastSession: {
          sessionUuid: session.sessionUuid,
          waiting: session.waiting,
          state: session.state,
          archived: session.archivedAt !== null,
          startedAt: session.createdAt,
        },
      }
    : {};
}

function builtinItem(key: AiBuiltinTemplateKey): AiTemplateItem {
  const row = rowOf(builtinTemplateId(key));
  const words = THEI_SERVER.phrase.ai_template_builtins[key];
  return {
    templateId: builtinTemplateId(key),
    builtin: key,
    title: words.title,
    instruction: words.instruction,
    model: row?.model ?? '',
    ...lastSessionOf(builtinTemplateId(key), row),
  };
}

function ownItem(row: TemplateRow): AiTemplateItem {
  return {
    templateId: row.templateId,
    title: row.title ?? '',
    instruction: row.instruction ?? '',
    model: row.model,
    ...lastSessionOf(row.templateId, row),
  };
}

export function listTemplates(): AiTemplateItem[] {
  const { db, schema } = THEI_SERVER.useDb();
  const own = (
    db
      .select()
      .from(schema.aiTemplates)
      .orderBy(asc(schema.aiTemplates.createdAt))
      .all() as TemplateRow[]
  ).filter((row) => !row.builtin);
  return [...AI_BUILTIN_TEMPLATE_KEYS.map(builtinItem), ...own.map(ownItem)];
}

export function findTemplate(templateId: string): AiTemplateItem | undefined {
  const key = builtinKeyOf(templateId);
  if (key) return builtinItem(key);
  const row = rowOf(templateId);
  return row && !row.builtin ? ownItem(row) : undefined;
}

function cleanLine(value: unknown, max: number, what: string): string {
  const text =
    typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (!text) fail(`Write its ${what}.`);
  if (text.length > max) fail(`Its ${what} is at most ${max} characters.`);
  return text;
}

export interface TemplateInput {
  title?: unknown;
  instruction?: unknown;
  model?: unknown;
}

/**
 * Saves a template: a new one of the owner's when `templateId` is null, or
 * what the owner changed of one. Of a built-in one only its model is the
 * owner's; its words are the code's.
 */
export function saveTemplate(
  templateId: string | null,
  input: TemplateInput,
  now = Date.now(),
): AiTemplateItem {
  const current = templateId ? findTemplate(templateId) : undefined;
  if (templateId && !current) fail('There is no such template.');
  const builtin = current?.builtin;
  const model =
    input.model === undefined
      ? (current?.model ?? '')
      : typeof input.model === 'string'
        ? input.model.trim().slice(0, 200)
        : fail('The model is named by a word.');
  const words = builtin
    ? { title: null, instruction: null }
    : {
        title:
          input.title === undefined && current
            ? current.title
            : cleanLine(input.title, AI_TEMPLATE_TITLE_MAX, 'title'),
        instruction:
          input.instruction === undefined && current
            ? current.instruction
            : cleanLine(
                input.instruction,
                AI_TEMPLATE_INSTRUCTION_MAX,
                'request',
              ),
      };
  const id = templateId ?? `${EntityPrefix.AiTemplate}-${randomUUID()}`;
  const { db, schema } = THEI_SERVER.useDb();
  db.insert(schema.aiTemplates)
    .values({
      templateId: id,
      builtin: builtin ?? null,
      ...words,
      model,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.aiTemplates.templateId,
      set: { ...words, model, updatedAt: now },
    })
    .run();
  return findTemplate(id)!;
}

/** A copy of a template as the owner's own ready-made request. */
export function copyTemplate(templateId: string, now = Date.now()) {
  const source = findTemplate(templateId) ?? fail('There is no such template.');
  return saveTemplate(
    null,
    {
      title: THEI_SERVER.phrase
        .ai_template_copy_title(source.title)
        .slice(0, AI_TEMPLATE_TITLE_MAX),
      instruction: source.instruction,
      model: source.model,
    },
    now,
  );
}

export function deleteTemplate(templateId: string) {
  const template =
    findTemplate(templateId) ?? fail('There is no such template.');
  if (template.builtin) fail('A built-in template is not deleted.');
  const { db, schema } = THEI_SERVER.useDb();
  db.delete(schema.aiTemplates)
    .where(eq(schema.aiTemplates.templateId, templateId))
    .run();
}

/** Records the session a check's run started. */
export function recordRun(templateId: string, sessionUuid: string, at: number) {
  const template = findTemplate(templateId);
  if (!template) return;
  const { db, schema } = THEI_SERVER.useDb();
  db.insert(schema.aiTemplates)
    .values({
      templateId,
      builtin: template.builtin ?? null,
      title: null,
      instruction: null,
      model: template.model,
      lastSessionUuid: sessionUuid,
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoUpdate({
      target: schema.aiTemplates.templateId,
      set: { lastSessionUuid: sessionUuid },
    })
    .run();
}
