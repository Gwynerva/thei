import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { AiTemplateSchedule } from '#layers/thei/shared/ai';
import {
  AI_BUILTIN_TEMPLATE_KEYS,
  AI_BUILTIN_TEMPLATES,
  AI_TEMPLATE_INSTRUCTION_MAX,
  AI_TEMPLATE_TITLE_MAX,
  builtinTemplateId,
  type AiBuiltinTemplateKey,
  type AiTemplateItem,
} from '#layers/thei/shared/ai-template';
import { EntityPrefix } from '../../entity-id';
import { refuse as fail } from '../../entity-patch/text';
import { findSession } from '../sessions/store';
import { checkedSchedule, nextRunAt } from './schedule';

/**
 * The templates: the built-in ones, written in the code and set by the
 * owner — when they run, with which model, whether at all — and the owner's
 * own, written by the owner. A built-in one's settings are a row under its
 * id, made the first time the owner changes them.
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

function lastSessionOf(row: TemplateRow | undefined) {
  const session = row?.lastSessionUuid
    ? findSession(row.lastSessionUuid)
    : undefined;
  return session && !session.purgedAt
    ? {
        lastSession: {
          sessionUuid: session.sessionUuid,
          waiting: session.waiting,
          state: session.state,
        },
      }
    : {};
}

function runs(row: TemplateRow | undefined) {
  return {
    ...(row?.nextRunAt ? { nextRunAt: row.nextRunAt } : {}),
    ...(row?.lastRunAt ? { lastRunAt: row.lastRunAt } : {}),
    ...lastSessionOf(row),
  };
}

function builtinItem(key: AiBuiltinTemplateKey): AiTemplateItem {
  const row = rowOf(builtinTemplateId(key));
  const words = THEI_SERVER.phrase.ai_template_builtins[key];
  const defaults = AI_BUILTIN_TEMPLATES[key];
  return {
    templateId: builtinTemplateId(key),
    builtin: key,
    title: words.title,
    instruction: words.instruction,
    model: row?.model ?? '',
    schedule: row?.schedule ?? (defaults.schedule as AiTemplateSchedule),
    enabled: row?.enabled ?? false,
    ...runs(row),
  };
}

function ownItem(row: TemplateRow): AiTemplateItem {
  return {
    templateId: row.templateId,
    title: row.title ?? '',
    instruction: row.instruction ?? '',
    model: row.model,
    schedule: row.schedule,
    enabled: row.enabled,
    ...runs(row),
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
  schedule?: unknown;
  enabled?: unknown;
}

/**
 * Saves a template: a new one of the owner's when `templateId` is null, or
 * what the owner changed of one. Of a built-in one only its model, schedule
 * and switch are the owner's; its words are the code's.
 */
export function saveTemplate(
  templateId: string | null,
  input: TemplateInput,
  now = Date.now(),
): AiTemplateItem {
  const current = templateId ? findTemplate(templateId) : undefined;
  if (templateId && !current) fail('There is no such template.');
  const builtin = current?.builtin as AiBuiltinTemplateKey | undefined;
  const model =
    input.model === undefined
      ? (current?.model ?? '')
      : typeof input.model === 'string'
        ? input.model.trim().slice(0, 200)
        : fail('The model is named by a word.');
  const schedule =
    input.schedule === undefined
      ? (current?.schedule ?? { kind: 'manual' as const })
      : checkedSchedule(input.schedule);
  const enabled =
    input.enabled === undefined
      ? (current?.enabled ?? true)
      : Boolean(input.enabled);
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
  const next = enabled ? nextRunAt(schedule, now) : null;
  const { db, schema } = THEI_SERVER.useDb();
  db.insert(schema.aiTemplates)
    .values({
      templateId: id,
      builtin: builtin ?? null,
      ...words,
      model,
      schedule,
      enabled,
      nextRunAt: next,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: schema.aiTemplates.templateId,
      set: {
        ...words,
        model,
        schedule,
        enabled,
        nextRunAt: next,
        updatedAt: now,
      },
    })
    .run();
  return findTemplate(id)!;
}

/** A copy of a template as the owner's own, off until they turn it on. */
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
      schedule: source.schedule,
      enabled: false,
    },
    now,
  );
}

export function deleteTemplate(templateId: string) {
  const template =
    findTemplate(templateId) ?? fail('There is no such template.');
  if (template.builtin) fail('A built-in template is turned off, not deleted.');
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    tx.delete(schema.aiTemplates)
      .where(eq(schema.aiTemplates.templateId, templateId))
      .run();
    tx.delete(schema.aiTemplateMarks)
      .where(eq(schema.aiTemplateMarks.templateId, templateId))
      .run();
  });
}

/**
 * Records a run: the session it started, when, and the next one. A run that
 * could not happen moves only the next one on: «since the last run» stays
 * since the last run that read anything.
 */
export function recordRun(
  templateId: string,
  run: { at: number; sessionUuid?: string },
) {
  const template = findTemplate(templateId);
  if (!template) return;
  const { db, schema } = THEI_SERVER.useDb();
  const next = template.enabled ? nextRunAt(template.schedule, run.at) : null;
  const builtin = template.builtin ?? null;
  db.insert(schema.aiTemplates)
    .values({
      templateId,
      builtin,
      title: null,
      instruction: null,
      model: template.model,
      schedule: template.schedule,
      enabled: template.enabled,
      nextRunAt: next,
      lastRunAt: run.sessionUuid ? run.at : null,
      lastSessionUuid: run.sessionUuid ?? null,
      createdAt: run.at,
      updatedAt: run.at,
    })
    .onConflictDoUpdate({
      target: schema.aiTemplates.templateId,
      set: {
        nextRunAt: next,
        ...(run.sessionUuid
          ? { lastRunAt: run.at, lastSessionUuid: run.sessionUuid }
          : {}),
      },
    })
    .run();
}

/** The templates whose time has come: switched on, and due. */
export function dueTemplates(now: number): AiTemplateItem[] {
  return listTemplates().filter(
    (template) =>
      template.enabled &&
      template.nextRunAt !== undefined &&
      template.nextRunAt <= now,
  );
}
