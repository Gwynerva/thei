import { z } from 'zod';
import {
  RELATION_WORD_FROM_OTHER_END,
  RELATION_WORDS,
  type RelationEditItem,
} from '#layers/thei/shared/relation';
import { refuse as fail } from '../../../entity-patch/text';
import {
  checkedRelationEnd,
  existingTag,
} from '../../../entity-patch/validate';
import { findEntity, refOf, type EntityKey } from '../../../entity-kinds';
import { loadForm } from '../../forms/load';
import { currentRelation, currentTags } from '../current';
import { sameValue } from '../values';
import { applyFormChanges } from '../write';
import type { AiActionKindDef } from '../types';
import { target } from './common';

/**
 * Actions on what an entity is joined to: its tags, and the relations of the
 * owner's map — deliberate claims, never a mere mention.
 */

const RELATION_SAID = {
  related: 'is related to',
  'depends-on': 'depends on',
  affects: 'affects',
} as const;

export const tagsAction: AiActionKindDef<'tags'> = {
  kind: 'tags',
  reference:
    'Tags of a project or an event: add [{ ref } or { title }], remove [{ ref }]. A title no tag has makes a new tag, so look for one first (list_entities, kind tag). Diary entries carry none.',
  schema: z.object({
    add: z
      .array(z.object({ ref: z.string().optional(), title: z.string() }))
      .default([]),
    remove: z
      .array(z.object({ ref: z.string(), title: z.string().default('') }))
      .default([]),
  }),
  targets: ['project', 'event'],
  async prepare(key, input) {
    const entity = target(key);
    const current = currentTags(entity);
    const add = (input.add as { ref?: string; title: string }[]).map(
      (tag): { ref?: string; title: string } => {
        if (tag.ref) return existingTag(tag.ref);
        const title = (tag.title ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 100);
        if (!title) fail('A new tag needs a title.');
        return { title };
      },
    );
    const remove = (input.remove as { ref: string }[]).map((tag) => {
      const found = current.find((item) => item.ref === tag.ref);
      if (!found) fail(`${tag.ref} is not on ${refOf(entity)}.`);
      return found;
    });
    const pending = add.filter(
      (tag) =>
        !current.some((item) =>
          tag.ref
            ? item.ref === tag.ref
            : item.title.toLowerCase() === tag.title.toLowerCase(),
        ),
    );
    if (!pending.length && !remove.length)
      fail('It already carries those tags.');
    return {
      payload: { kind: 'tags', add: pending, remove },
      base: { tags: current.map((tag) => tag.ref) },
      dropped: [],
    };
  },
  identity: (payload) => [
    payload.add.map((tag) => tag.ref ?? tag.title.toLowerCase()).sort(),
    payload.remove.map((tag) => tag.ref).sort(),
  ],
  async apply(key, row, _context, write) {
    const entity = target(key);
    const payload = row.payload as {
      add: { ref?: string; title: string }[];
      remove: { ref: string }[];
    };
    const removed = new Set(payload.remove.map((tag) => tag.ref));
    const kept = currentTags(entity)
      .filter((tag) => !removed.has(tag.ref))
      .map((tag) => tag.ref);
    const added = payload.add
      .map((tag) => tag.ref ?? tag.title)
      .filter((name) => !kept.includes(name));
    await applyFormChanges(entity, { tags: [...kept, ...added] }, write);
    return entity;
  },
  evaluate(key, row) {
    const payload = row.payload as {
      add: { ref?: string; title: string }[];
      remove: { ref: string; title: string }[];
    };
    const current = currentTags(key!);
    const has = (tag: { ref?: string; title: string }) =>
      current.some((item) =>
        tag.ref
          ? item.ref === tag.ref
          : item.title.toLowerCase() === tag.title.toLowerCase(),
      );
    return payload.add.every(has) && !payload.remove.some(has)
      ? { state: 'done' }
      : { state: 'open' };
  },
  summary(payload) {
    const named = (tags: { title: string }[]) =>
      tags.map((tag) => `"${tag.title}"`).join(', ');
    const parts = [
      payload.add.length ? `add ${named(payload.add)}` : '',
      payload.remove.length ? `remove ${named(payload.remove)}` : '',
    ];
    return `Tags: ${parts.filter(Boolean).join('; ')}`;
  },
};

export const relationAction: AiActionKindDef<'relation'> = {
  kind: 'relation',
  reference:
    'A relation of the owner’s map, between projects, events and diary entries: other (a ref), relation — related | depends-on (the target depends on the other) | affects — op add | change | remove, a note, and whyNotInlineLink: why a link in the text would not do. A relation is a deliberate claim of a real dependency; a mere mention deserves a link (revise, category link). It needs its reason.',
  schema: z.object({
    op: z.enum(['add', 'change', 'remove']).default('add'),
    other: z.string(),
    relation: z.enum(RELATION_WORDS).default('related'),
    note: z.unknown().optional(),
    whyNotInlineLink: z.string().optional(),
  }),
  targets: ['project', 'event', 'diary-entry'],
  async prepare(key, input, context) {
    const entity = target(key);
    const other = checkedRelationEnd(entity, input.other);
    if (!context.reason.trim())
      fail('A relation needs its reason: what real dependency joins the two.');
    if (input.op !== 'remove' && !input.whyNotInlineLink?.trim())
      fail(
        'Say why an inline link would not do (whyNotInlineLink): a relation is more than a mention.',
      );
    const current = currentRelation(entity, other);
    if (input.op === 'remove' && !current)
      fail('There is no such relation to remove.');
    if (input.op !== 'remove' && current === input.relation)
      fail('That relation is already there.');
    return {
      payload: {
        kind: 'relation',
        op: input.op === 'remove' ? 'remove' : current ? 'change' : 'add',
        other: refOf(other),
        relation: input.relation,
        ...(input.note ? { note: input.note } : {}),
        ...(input.whyNotInlineLink
          ? { whyNotInlineLink: input.whyNotInlineLink }
          : {}),
      },
      base: { relation: current ?? null },
      dropped: [],
    };
  },
  // One relation read from either end: A depends on B is B affects A.
  identityHasTarget: true,
  identity(payload, key) {
    const self = key ? refOf(key) : '';
    return self < payload.other
      ? [payload.op === 'remove', self, payload.other, payload.relation]
      : [
          payload.op === 'remove',
          payload.other,
          self,
          RELATION_WORD_FROM_OTHER_END[payload.relation],
        ];
  },
  async apply(key, row, _context, write) {
    const entity = target(key);
    const payload = row.payload as {
      op: 'add' | 'change' | 'remove';
      other: string;
      relation: string;
      note?: unknown;
    };
    const other =
      findEntity(payload.other) ?? fail(`There is no ${payload.other} now.`);
    const loaded = await loadForm(entity);
    const items = ((loaded.form.relations ?? []) as RelationEditItem[])
      .filter(
        (item) =>
          !(item.entityType === other.kind && item.entityId === other.id),
      )
      .map((item) => ({
        ref: refOf({ kind: item.entityType, id: item.entityId } as EntityKey),
      })) as Record<string, unknown>[];
    if (payload.op !== 'remove')
      items.push({
        ref: payload.other,
        kind: payload.relation,
        ...(payload.note && typeof payload.note === 'object'
          ? 'text' in payload.note
            ? { note: (payload.note as { text?: string }).text ?? '' }
            : {
                notes: {
                  this: (payload.note as { currentText?: string }).currentText,
                  other: (payload.note as { relatedText?: string }).relatedText,
                },
              }
          : {}),
      });
    await applyFormChanges(entity, { relations: items }, write);
    return entity;
  },
  evaluate(key, row) {
    const payload = row.payload as {
      op: 'add' | 'change' | 'remove';
      other: string;
      relation: string;
    };
    const base = (row.base ?? {}) as { relation?: unknown };
    const other = findEntity(payload.other);
    if (!other) return { state: 'gone' };
    const current = currentRelation(key!, other);
    if (payload.op === 'remove')
      return current ? { state: 'open' } : { state: 'done' };
    if (current === payload.relation) return { state: 'done' };
    return sameValue(current ?? null, base.relation ?? null)
      ? { state: 'open' }
      : { state: 'stale' };
  },
  summary: (payload) =>
    payload.op === 'remove'
      ? `No relation to ${payload.other}`
      : `${payload.op === 'change' ? 'Relation changed: this' : 'This'} ${RELATION_SAID[payload.relation]} ${payload.other}`,
};
