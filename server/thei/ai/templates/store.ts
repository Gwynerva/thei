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
 * The templates: the built-in checks, written in the code, and the owner's
 * own ready-made requests, written by the owner. A built-in one has a row
 * under its id from its first run, which keeps its last session.
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
    ...lastSessionOf(builtinTemplateId(key), row),
  };
}

function ownItem(row: TemplateRow): AiTemplateItem {
  return {
    templateId: row.templateId,
    title: row.title ?? '',
    instruction: row.instruction ?? '',
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
  return checkedLength(text, max, what);
}

/**
 * A request as the owner wrote it: its lines and paragraphs kept, the
 * spaces at the ends of lines dropped, and at most one empty line between
 * two paragraphs.
 */
function cleanParagraphs(value: unknown, max: number, what: string): string {
  const text =
    typeof value === 'string'
      ? value
          .replace(/\r\n?/g, '\n')
          .split('\n')
          .map((line) => line.replace(/[^\S\n]+/g, ' ').trimEnd())
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      : '';
  return checkedLength(text, max, what);
}

function checkedLength(text: string, max: number, what: string): string {
  if (!text) fail(`Write its ${what}.`);
  if (text.length > max) fail(`Its ${what} is at most ${max} characters.`);
  return text;
}

export interface TemplateInput {
  title?: unknown;
  instruction?: unknown;
}

/**
 * Saves a template of the owner's: a new one when `templateId` is null, or
 * what the owner changed of one. A built-in one's words are the code's: it
 * is copied to be changed.
 */
export function saveTemplate(
  templateId: string | null,
  input: TemplateInput,
  now = Date.now(),
): AiTemplateItem {
  const current = templateId ? findTemplate(templateId) : undefined;
  if (templateId && !current) fail('There is no such template.');
  if (current?.builtin)
    fail('A built-in template is not changed: copy it to make it your own.');
  const words = {
    title:
      input.title === undefined && current
        ? current.title
        : cleanLine(input.title, AI_TEMPLATE_TITLE_MAX, 'title'),
    instruction:
      input.instruction === undefined && current
        ? current.instruction
        : cleanParagraphs(
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
      builtin: null,
      ...words,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.aiTemplates.templateId,
      set: { ...words, updatedAt: now },
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
