import { z } from 'zod';
import { AI_FIELD_ACTIONS } from '#layers/thei/shared/ai-actions';
import { refuse as fail } from '../../../entity-patch/text';
import {
  checkedAccess,
  checkedPeriods,
  hasPeriods,
} from '../../../entity-patch/validate';
import { refOf } from '../../../entity-kinds';
import { assertKnown, type FormKind } from '../../forms/changes';
import { changedForm, loadForm } from '../../forms/load';
import { currentField, currentPeriods } from '../current';
import { assetIdsIn, checkFieldValue, sameValue } from '../values';
import { applyFormChanges, pick } from '../write';
import type { AiActionKindDef } from '../types';
import { clipped, target } from './common';

/**
 * Actions on an entity's form: a field set, its dates, who may see it, and
 * any change an editor's form takes.
 */

export const fieldAction: AiActionKindDef<'field'> = {
  kind: 'field',
  reference: `One field set on its own: field and value. Fields by kind: ${Object.entries(
    AI_FIELD_ACTIONS,
  )
    .map(([kind, fields]) => `${kind} — ${fields.join(', ')}`)
    .join(
      '; ',
    )}. showcase and cv take true or false, synonyms a list of names — only names really used for it: an abbreviation, a nickname, its name in another language (bg3, бг3; ЗГТ, HRT), never a description or a piece of the title — the rest text. A summary is a couple of short sentences, the length of a search engine's description — not a one-liner.`,
  schema: z.object({
    field: z.string(),
    value: z.union([z.string(), z.boolean(), z.array(z.string())]),
  }),
  targets: Object.keys(AI_FIELD_ACTIONS) as (keyof typeof AI_FIELD_ACTIONS)[],
  async prepare(key, input) {
    const entity = target(key);
    const allowed =
      (AI_FIELD_ACTIONS as Record<string, readonly string[]>)[entity.kind] ??
      [];
    if (!allowed.includes(input.field))
      fail(
        `${refOf(entity)} takes ${allowed.join(', ') || 'no fields'} this way, not ${input.field}.`,
      );
    const value = checkFieldValue(
      input.field,
      input.value,
      String(currentField(entity, 'title') ?? ''),
    );
    const current = currentField(entity, input.field);
    if (sameValue(current, value)) fail('That is already its value.');
    return {
      payload: { kind: 'field', field: input.field, value },
      base: { value: current },
      dropped: [],
    };
  },
  identity: (payload) => [payload.field, payload.value],
  async apply(key, row, _context, write) {
    const entity = target(key);
    const payload = row.payload as { field: string; value: unknown };
    await applyFormChanges(entity, { [payload.field]: payload.value }, write);
    return entity;
  },
  evaluate(key, row) {
    const payload = row.payload as { field: string; value: unknown };
    const base = (row.base ?? {}) as { value?: unknown };
    const current = currentField(key!, payload.field);
    if (sameValue(current, payload.value)) return { state: 'done' };
    return sameValue(current, base.value)
      ? { state: 'open' }
      : { state: 'stale' };
  },
  summary(payload) {
    const value = Array.isArray(payload.value)
      ? payload.value.join(', ')
      : String(payload.value);
    return `${payload.field} → "${clipped(value)}"`;
  },
};

export const periodsAction: AiActionKindDef<'periods'> = {
  kind: 'periods',
  reference:
    'The dated periods of an event or a project section, the whole list: periods [{ startDate, endDate, precision?, precisionNote?, label? }]. A section with periods is a stage of its project; an event needs at least one.',
  schema: z.object({ periods: z.array(z.record(z.string(), z.unknown())) }),
  targets: ['event', 'project-section'],
  async prepare(key, input) {
    const entity = target(key);
    if (!hasPeriods(entity.kind))
      fail(
        'Only events and project sections have periods; a project takes its dates from its stages.',
      );
    const periods = checkedPeriods(input.periods);
    const current = currentPeriods(entity);
    if (sameValue(current, periods)) fail('Those are already its periods.');
    return {
      payload: { kind: 'periods', periods },
      base: { periods: current },
      dropped: [],
    };
  },
  identity: (payload) => [payload.periods],
  async apply(key, row, _context, write) {
    const entity = target(key);
    const payload = row.payload as { periods: unknown[] };
    await applyFormChanges(entity, { periods: payload.periods }, write);
    return entity;
  },
  evaluate(key, row) {
    const payload = row.payload as { periods: unknown };
    const base = (row.base ?? {}) as { periods?: unknown };
    const current = currentPeriods(key!);
    if (sameValue(current, payload.periods)) return { state: 'done' };
    return sameValue(current, base.periods)
      ? { state: 'open' }
      : { state: 'stale' };
  },
  summary: (payload) =>
    `Periods: ${payload.periods
      .map(
        (period) =>
          `${period.startDate}…${period.endDate}${period.label ? ` "${clipped(period.label, 40)}"` : ''}`,
      )
      .join('; ')}`,
};

export const accessAction: AiActionKindDef<'access'> = {
  kind: 'access',
  reference:
    'Who may see it: access, public | link-only | private; a diary entry is public or private. Always the owner’s call: propose it only when they asked.',
  schema: z.object({ access: z.enum(['public', 'link-only', 'private']) }),
  targets: ['project', 'event', 'diary-entry', 'page'],
  async prepare(key, input) {
    const entity = target(key);
    const access = checkedAccess(entity.kind, input.access);
    const current = currentField(entity, 'access');
    if (current === access) fail(`It is already ${access}.`);
    return {
      payload: { kind: 'access', access },
      base: { access: current },
      dropped: [],
    };
  },
  identity: (payload) => [payload.access],
  async apply(key, row, _context, write) {
    const entity = target(key);
    const payload = row.payload as { access: string };
    await applyFormChanges(entity, { access: payload.access }, write);
    return entity;
  },
  evaluate(key, row) {
    const payload = row.payload as { access: string };
    const base = (row.base ?? {}) as { access?: unknown };
    const current = currentField(key!, 'access');
    if (current === payload.access) return { state: 'done' };
    return current === base.access ? { state: 'open' } : { state: 'stale' };
  },
  summary: (payload) => `Access → ${payload.access}`,
};

/**
 * Any change an entity's form takes, as an editor's key may make it: the
 * fields it names are laid over the form as it is, and it waits — or applies
 * at once — like any action. What it changes is told against the form it was
 * made over: open while those fields still read so, done once they read as it
 * would leave them, stale when they moved another way.
 */
export const updateAction: AiActionKindDef<'update'> = {
  kind: 'update',
  reference:
    'Any change the entity’s form takes: changes { field: value }, the fields as FORM_FIELDS names them below. A list given replaces the list it names; a project’s sections merge by id. Texts in editing Markdown. Prefer a narrower kind where one fits — field, periods, tags, relation, access, write, revise: the owner reads those at a glance.',
  schema: z.object({ changes: z.record(z.string(), z.unknown()) }),
  targets: [
    'project',
    'project-section',
    'event',
    'diary-entry',
    'page',
    'tag',
    'profile',
  ],
  async prepare(key, input) {
    const entity = target(key);
    const changes = input.changes as Record<string, unknown>;
    if (!Object.keys(changes).length) fail('Name the fields it changes.');
    assertKnown(entity.kind as FormKind, changes);
    const loaded = await loadForm(entity);
    const next = await changedForm(entity, loaded, changes);
    const fields = Object.keys(next).filter(
      (field) =>
        JSON.stringify(next[field]) !== JSON.stringify(loaded.form[field]),
    );
    if (!fields.length)
      fail('It changes nothing: the entity already reads so.');
    return {
      payload: { kind: 'update', changes },
      base: {
        fields,
        before: pick(loaded.form, fields),
        after: pick(next, fields),
      },
      dropped: [],
      assetUuids: [...assetIdsIn(changes)],
    };
  },
  identity: (payload) => [payload.changes],
  async apply(key, row, _context, write) {
    const entity = target(key);
    const payload = row.payload as { changes: Record<string, unknown> };
    await applyFormChanges(entity, payload.changes, write);
    return entity;
  },
  async evaluate(key, row) {
    const base = (row.base ?? {}) as {
      fields?: string[];
      before?: unknown;
      after?: unknown;
    };
    const loaded = await loadForm(key!).catch(() => undefined);
    if (!loaded) return { state: 'gone' };
    const now = pick(loaded.form, base.fields ?? []);
    if (sameValue(now, base.after)) return { state: 'done' };
    return sameValue(now, base.before) ? { state: 'open' } : { state: 'stale' };
  },
  summary: (payload) => `Change ${Object.keys(payload.changes).join(', ')}`,
};
