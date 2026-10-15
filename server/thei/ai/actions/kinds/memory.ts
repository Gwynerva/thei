import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  AI_ANCHOR_MEMORY_MAX,
  AI_OWNER_MEMORY_MAX,
} from '#layers/thei/shared/ai';
import { AI_MEMORY_TEXT_MAX } from '#layers/thei/shared/ai-memory';
import { AI_REMEMBER_ABOUT } from '#layers/thei/shared/ai-actions';
import { refuse as fail } from '../../../entity-patch/text';
import { findEntity, refOf, type EntityKey } from '../../../entity-kinds';
import { updateTheiConfig } from '../../../config/write';
import {
  addMemory,
  anchorRows,
  factsSize,
  isMemoryKind,
  type MemoryAnchor,
  type MemoryRow,
} from '../../memory/store';
import { checkedTerm, findTerm, putTerm, termKey } from '../../terms';
import type { ActionEvaluation, AiActionKindDef } from '../types';
import { clipped } from './common';

/**
 * The AI's memory and dictionary, changed by actions: a fact to remember,
 * a word of the owner's, a memory grown long said again in fewer words.
 * Like any action they wait for the owner; applied, they are undone while
 * what they left still reads so.
 */

/** Every kind an entity of the archive may be remembered by. */
const REMEMBERED = [
  'project',
  'project-section',
  'event',
  'diary-entry',
  'page',
  'tag',
] as const;

const sameWords = (left: string, right: string) =>
  left.replace(/\s+/g, ' ').trim().toLowerCase() ===
  right.replace(/\s+/g, ' ').trim().toLowerCase();

interface AnchorInput {
  about?: string;
  other?: string;
  entityKind?: string;
}

/** The anchor an action names, from its target and the words beside it. */
function anchorFrom(
  key: EntityKey | undefined,
  input: AnchorInput,
): MemoryAnchor {
  const about =
    input.about ??
    (key && input.other
      ? 'pair'
      : key
        ? 'entity'
        : input.entityKind
          ? 'kind'
          : 'owner');
  switch (about) {
    case 'entity':
      if (!key) fail('Name the entity it is about as target.');
      return { anchor: 'entity', entity: key };
    case 'pair': {
      if (!key || !input.other)
        fail('A pair is the target and other, both entities.');
      const other =
        findEntity(input.other) ?? fail(`There is no ${input.other}.`);
      if (refOf(other) === refOf(key)) fail('A pair is two entities.');
      return { anchor: 'pair', entity: key, other };
    }
    case 'kind':
      if (!isMemoryKind(input.entityKind))
        fail(`entityKind is one of: ${REMEMBERED.join(', ')}.`);
      return { anchor: 'kind', kind: input.entityKind };
    case 'owner':
      return { anchor: 'owner' };
    default:
      fail(`about is one of: ${AI_REMEMBER_ABOUT.join(', ')}.`);
  }
}

/** The anchor an action was kept with, its entities found again. */
function anchorOfPayload(
  key: EntityKey | undefined,
  payload: AnchorInput,
): MemoryAnchor | undefined {
  try {
    return anchorFrom(key, payload);
  } catch {
    return undefined;
  }
}

/** The words that make an anchor itself, read the same either way round. */
function anchorIdentity(anchor: MemoryAnchor): string {
  switch (anchor.anchor) {
    case 'owner':
      return 'owner';
    case 'entity':
      return `entity:${refOf(anchor.entity)}`;
    case 'pair':
      return `pair:${[refOf(anchor.entity), refOf(anchor.other)].sort().join('|')}`;
    case 'kind':
      return `kind:${anchor.kind}`;
  }
}

/** What the payload keeps of an anchor. */
function anchorPayload(anchor: MemoryAnchor) {
  return {
    about: anchor.anchor,
    ...(anchor.anchor === 'pair' ? { other: refOf(anchor.other) } : {}),
    ...(anchor.anchor === 'kind' ? { entityKind: anchor.kind } : {}),
  };
}

const anchorSchema = {
  about: z.enum(AI_REMEMBER_ABOUT).optional(),
  other: z.string().optional(),
  entityKind: z.string().optional(),
};

const ownerText = () => THEI_SERVER.config.mcp.instructions;

/** «About you» with a line added: a paragraph of its own. */
function withOwnerLine(text: string, line: string) {
  const current = text.trim();
  return current ? `${current}\n\n${line}` : line;
}

export const rememberAction: AiActionKindDef<'remember'> = {
  kind: 'remember',
  reference:
    'Remembers a fact the owner told or confirmed, anchored to what it is about — and read only with that: about entity (the target; the default with a target), pair (the target with other, both entities), kind (every entity of entityKind: project, event, diary-entry…), or owner (into «about you», read in every session). text is a sentence or two. Not for what the archive itself says, nor for guesses.',
  schema: z.object({ text: z.string(), ...anchorSchema }),
  targets: REMEMBERED,
  async prepare(key, input) {
    const anchor = anchorFrom(key, input);
    const text = (input.text as string).replace(/\s+/g, ' ').trim();
    if (!text) fail('Say what to remember.');
    if (text.length > AI_MEMORY_TEXT_MAX) fail('A fact is a sentence or two.');
    if (anchor.anchor === 'owner') {
      if (ownerText().includes(text)) fail('«About you» says so already.');
      if (withOwnerLine(ownerText(), text).length > AI_OWNER_MEMORY_MAX)
        fail(
          `«About you» would pass ${AI_OWNER_MEMORY_MAX} characters: tell the owner to make room in it.`,
        );
    } else {
      const rows = anchorRows(anchor);
      if (rows.some((row) => row.type === 'fact' && sameWords(row.text, text)))
        fail('It is remembered so already.');
      if (factsSize(rows) + text.length > AI_ANCHOR_MEMORY_MAX)
        fail(
          `Its memory would pass ${AI_ANCHOR_MEMORY_MAX} characters: propose memory-compact for it first, in the same call.`,
        );
    }
    return {
      payload: { kind: 'remember', ...anchorPayload(anchor), text },
      base: null,
      dropped: [],
    };
  },
  identity: (payload, key) => {
    const anchor = anchorOfPayload(key, payload);
    return [anchor ? anchorIdentity(anchor) : '', payload.text.toLowerCase()];
  },
  identityHasTarget: true,
  async apply(key, row, _context, write) {
    const payload = row.payload as { text: string } & AnchorInput;
    const anchor =
      anchorOfPayload(key, payload) ?? fail('What it is about is gone.');
    const { db, schema } = THEI_SERVER.useDb();
    if (anchor.anchor === 'owner') {
      // Read and written in the config's own queue, so a save of «about
      // you» made just before is built on, never written over.
      let before = '';
      let after = '';
      await updateTheiConfig((config) => {
        before = config.mcp.instructions;
        after = withOwnerLine(before, payload.text);
        if (after.length > AI_OWNER_MEMORY_MAX)
          fail('«About you» has no room for it.');
        return { ...config, mcp: { ...config.mcp, instructions: after } };
      });
      try {
        db.transaction((tx) =>
          write(tx, schema, { kind: 'memory', owner: { before, after } }),
        );
      } catch (error) {
        // Not recorded, not made: «about you» goes back while it reads so.
        await updateTheiConfig((config) =>
          config.mcp.instructions === after
            ? { ...config, mcp: { ...config.mcp, instructions: before } }
            : config,
        );
        throw error;
      }
      return undefined;
    }
    db.transaction((tx) => {
      const memoryUuid = addMemory(
        anchor,
        { text: payload.text, sessionUuid: row.sessionUuid },
        Date.now(),
        tx,
      );
      write(tx, schema, {
        kind: 'memory',
        added: [{ memoryUuid, text: payload.text }],
      });
    });
    return anchor.anchor === 'kind' ? undefined : anchor.entity;
  },
  evaluate(key, row): ActionEvaluation {
    const payload = row.payload as { text: string } & AnchorInput;
    const anchor = anchorOfPayload(key, payload);
    if (!anchor) return { state: 'gone' };
    if (anchor.anchor === 'owner')
      return ownerText().includes(payload.text)
        ? { state: 'done' }
        : { state: 'open' };
    return anchorRows(anchor).some(
      (item) => item.type === 'fact' && sameWords(item.text, payload.text),
    )
      ? { state: 'done' }
      : { state: 'open' };
  },
  summary: (payload) =>
    `Remember${payload.about === 'owner' ? ' about the owner' : payload.about === 'kind' ? ` about every ${payload.entityKind}` : ''}: ${clipped(payload.text, 100)}`,
};

export const termAction: AiActionKindDef<'term'> = {
  kind: 'term',
  reference:
    'A word of the owner’s dictionary — a name, a place, a word of their own — added or said again: word as the owner writes it, note (what it is, how it is written, at most 300 characters), forms (other forms of it worth listing, as written), keep (true: proofreading leaves it as written — the default). Its note is read wherever the word is. Propose it when a word recurs that a stranger, or a spellchecker, would get wrong.',
  schema: z.object({
    word: z.string(),
    note: z.string().optional(),
    forms: z.array(z.string()).max(12).optional(),
    keep: z.boolean().optional(),
  }),
  targets: [],
  async prepare(key, input) {
    if (key) fail('A word of the dictionary is about no entity: name none.');
    const existing = findTerm(input.word);
    const term = checkedTerm({
      display: input.word,
      note: input.note ?? existing?.note ?? '',
      forms: input.forms ?? existing?.forms ?? [],
      keep: input.keep ?? existing?.keep ?? true,
    });
    if (
      existing &&
      existing.display === term.display &&
      existing.note === term.note &&
      existing.keep === term.keep &&
      JSON.stringify(existing.forms) === JSON.stringify(term.forms)
    )
      fail('The dictionary has it so already.');
    return {
      payload: {
        kind: 'term',
        word: term.display,
        note: term.note,
        forms: term.forms,
        keep: term.keep,
      },
      base: existing ? { before: existing } : null,
      dropped: [],
    };
  },
  identity: (payload) => [termKey(payload.word)],
  async apply(_key, row, _context, write) {
    const payload = row.payload as {
      word: string;
      note: string;
      forms: string[];
      keep: boolean;
    };
    const term = checkedTerm({
      display: payload.word,
      note: payload.note,
      forms: payload.forms,
      keep: payload.keep,
    });
    const { db, schema } = THEI_SERVER.useDb();
    const now = Date.now();
    db.transaction((tx) => {
      const before = findTerm(term.word) ?? null;
      putTerm(tx, schema, term, before ? before.word : undefined, now);
      write(tx, schema, {
        kind: 'memory',
        term: {
          before,
          after: {
            ...term,
            createdAt: before?.createdAt ?? now,
            updatedAt: now,
          },
        },
      });
    });
    return undefined;
  },
  evaluate(_key, row): ActionEvaluation {
    const payload = row.payload as {
      word: string;
      note: string;
      keep: boolean;
    };
    const now = findTerm(payload.word);
    return now && now.note === payload.note && now.keep === payload.keep
      ? { state: 'done' }
      : { state: 'open' };
  },
  summary: (payload) =>
    `Dictionary: ${payload.word}${payload.keep ? ' (keep)' : ''}${payload.note ? ` — ${clipped(payload.note, 80)}` : ''}`,
};

export const memoryCompactAction: AiActionKindDef<'memory-compact'> = {
  kind: 'memory-compact',
  reference:
    'Says the facts remembered about one anchor again in fewer words, when its memory grows long: the anchor as remember names it (about entity, pair or kind), and facts — the new facts, a sentence each, in place of all there are now. Keep every fact that still holds; merge, do not drop.',
  schema: z.object({
    facts: z.array(z.string()).min(1).max(12),
    ...anchorSchema,
  }),
  targets: REMEMBERED,
  async prepare(key, input) {
    const anchor = anchorFrom(key, input);
    if (anchor.anchor === 'owner')
      fail('«About you» is the owner’s to shorten, in their own words.');
    const now = anchorRows(anchor).filter((row) => row.type === 'fact');
    if (now.length < 2)
      fail('There is nothing to compact: fewer than two facts.');
    const facts = (input.facts as string[])
      .map((fact) => fact.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    if (!facts.length) fail('Give the facts to keep.');
    if (facts.some((fact) => fact.length > AI_MEMORY_TEXT_MAX))
      fail('A fact is a sentence or two.');
    const before = factsSize(now);
    const after = facts.reduce((sum, fact) => sum + fact.length, 0);
    if (after >= before) fail('Compacted, it says the same in fewer words.');
    return {
      payload: {
        kind: 'memory-compact',
        ...(anchorPayload(anchor) as {
          about: 'entity' | 'pair' | 'kind';
          other?: string;
          entityKind?: string;
        }),
        facts,
      },
      base: { memoryUuids: now.map((row) => row.memoryUuid) },
      dropped: [],
    };
  },
  identity: (payload, key) => {
    const anchor = anchorOfPayload(key, payload);
    return [
      anchor ? anchorIdentity(anchor) : '',
      payload.facts.join(' ').toLowerCase(),
    ];
  },
  identityHasTarget: true,
  async apply(key, row, _context, write) {
    const payload = row.payload as { facts: string[] } & AnchorInput;
    const anchor =
      anchorOfPayload(key, payload) ?? fail('What it is about is gone.');
    const base = row.base as { memoryUuids: string[] };
    const { db, schema } = THEI_SERVER.useDb();
    const now = Date.now();
    db.transaction((tx) => {
      const facts = (
        tx
          .select()
          .from(schema.aiMemory)
          .where(inArray(schema.aiMemory.memoryUuid, base.memoryUuids))
          .all() as MemoryRow[]
      ).filter((item) => item.type === 'fact');
      const current = anchorRows(anchor).filter((item) => item.type === 'fact');
      if (
        facts.length !== base.memoryUuids.length ||
        current.length !== facts.length
      )
        fail(
          'Its memory changed since: compact it again from what is there now.',
        );
      tx.delete(schema.aiMemory)
        .where(inArray(schema.aiMemory.memoryUuid, base.memoryUuids))
        .run();
      const added = payload.facts.map((text, index) => {
        const memoryUuid = addMemory(
          anchor,
          { text, sessionUuid: row.sessionUuid },
          now + index,
          tx,
        );
        return { memoryUuid, text };
      });
      write(tx, schema, { kind: 'memory', removed: facts as never, added });
    });
    return anchor.anchor === 'entity' || anchor.anchor === 'pair'
      ? anchor.entity
      : undefined;
  },
  evaluate(key, row): ActionEvaluation {
    const payload = row.payload as AnchorInput;
    const anchor = anchorOfPayload(key, payload);
    if (!anchor) return { state: 'gone' };
    const base = row.base as { memoryUuids: string[] };
    const current = anchorRows(anchor)
      .filter((item) => item.type === 'fact')
      .map((item) => item.memoryUuid)
      .sort();
    return JSON.stringify(current) ===
      JSON.stringify([...base.memoryUuids].sort())
      ? { state: 'open' }
      : { state: 'stale' };
  },
  summary: (payload) =>
    `Compact the memory into ${payload.facts.length} fact${payload.facts.length === 1 ? '' : 's'}`,
};

// ---- Undoing -------------------------------------------------------------------

type MemoryUndo = {
  kind: 'memory';
  added?: { memoryUuid: string; text: string }[];
  removed?: Record<string, unknown>[];
  term?: {
    before: import('#layers/thei/shared/ai').AiTerm | null;
    after: import('#layers/thei/shared/ai').AiTerm;
  };
  owner?: { before: string; after: string };
};

/** Whether what a memory action left still reads so. */
export function memoryUndoReady(undo: MemoryUndo): boolean {
  const { db, schema } = THEI_SERVER.useDb();
  if (undo.owner && ownerText() !== undo.owner.after) return false;
  if (undo.term) {
    const now = findTerm(undo.term.after.word);
    if (
      !now ||
      now.note !== undo.term.after.note ||
      now.keep !== undo.term.after.keep ||
      now.display !== undo.term.after.display
    )
      return false;
  }
  if (undo.added?.length) {
    const rows = db
      .select()
      .from(schema.aiMemory)
      .where(
        inArray(
          schema.aiMemory.memoryUuid,
          undo.added.map((item) => item.memoryUuid),
        ),
      )
      .all() as MemoryRow[];
    if (rows.length !== undo.added.length) return false;
    for (const item of undo.added)
      if (
        rows.find((row) => row.memoryUuid === item.memoryUuid)?.text !==
        item.text
      )
        return false;
  }
  return true;
}

/** Takes a memory action back, inside the transaction `finish` closes. */
export async function undoMemory(
  undo: MemoryUndo,
  finish: (tx: any, schema: any) => void,
) {
  const { db, schema } = THEI_SERVER.useDb();
  // «About you» goes back only while it reads as the action left it.
  if (undo.owner)
    await updateTheiConfig((config) => {
      if (config.mcp.instructions !== undo.owner!.after)
        fail('«About you» has changed since; change it back by hand.');
      return {
        ...config,
        mcp: { ...config.mcp, instructions: undo.owner!.before },
      };
    });
  db.transaction((tx) => {
    if (undo.added?.length)
      tx.delete(schema.aiMemory)
        .where(
          inArray(
            schema.aiMemory.memoryUuid,
            undo.added.map((item) => item.memoryUuid),
          ),
        )
        .run();
    if (undo.removed?.length)
      tx.insert(schema.aiMemory)
        .values(undo.removed as never)
        .run();
    if (undo.term) {
      tx.delete(schema.aiTerms)
        .where(eq(schema.aiTerms.word, undo.term.after.word))
        .run();
      if (undo.term.before)
        tx.insert(schema.aiTerms).values(undo.term.before).run();
    }
    finish(tx, schema);
  });
}
