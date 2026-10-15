import { z } from 'zod';
import type { ContentOutputData } from '#layers/thei/shared/content';
import {
  correctionPending,
  countTextMatches,
  editChangesOnlyTypography,
  editIsLocalFix,
  overlappingEdits,
  placeTextEdits,
  stripMarks,
} from '#layers/thei/shared/content-edit-markdown/patch-core';
import { prepareTextEdit } from '#layers/thei/shared/content-edit-markdown/patch';
import {
  alignTidyBase,
  planTidy,
  tidyBlockText,
  tidyHtmlText,
  tidyStats,
} from '#layers/thei/shared/content-edit-markdown/tidy';
import { mergeEditedBlocks } from '#layers/thei/shared/content-edit-markdown/merge';
import {
  applyRevise,
  plainOfHtml,
  takenParts,
} from '#layers/thei/shared/content-revise';
import {
  PROOFREAD_CATEGORIES,
  TIDY_COMMENT_KINDS,
  type TidyComment,
  type TidyItem,
} from '#layers/thei/shared/ai-revise';
import type {
  AiRevisePart,
  AiRevisePartState,
} from '#layers/thei/shared/ai-actions';
import { describeHistoryData } from '../../../content/history';
import { refuse as fail } from '../../../entity-patch/text';
import { refOf } from '../../../entity-kinds';
import { textFromMarkdown } from '../../../mcp/text-input';
import { keptWordsIn } from '../../terms';
import { currentNotesText, currentText, notesSlotOf } from '../current';
import {
  correctionFingerprint,
  correctionsKeptLately,
  neverOffered,
} from '../declined';
import { assetIdsIn, prepareLinkCorrection } from '../values';
import { applyText } from '../write';
import type { AiActionKindDef, PartStateRow } from '../types';
import { clipped, target } from './common';

/**
 * Actions on texts: an idea added to the private notes, a text written at the
 * owner's request, and a text edit — corrections of words, or a new order of
 * the owner's own blocks — whose parts are decided one by one.
 */

type Correction = Extract<AiRevisePart, { type: 'correction' }>;

/** Words alone, for telling whether a text already says something. */
function words(value: string) {
  return value
    .replace(/[\s*_~[\]()#>`-]+/g, ' ')
    .trim()
    .toLowerCase();
}

export const noteAction: AiActionKindDef<'note'> = {
  kind: 'note',
  reference:
    'An idea added at the end of the private notes of a project, an event, a diary entry or a page: markdown, a few lines in editing Markdown. Only the owner reads notes.',
  schema: z.object({ markdown: z.string() }),
  targets: ['project', 'event', 'diary-entry', 'page'],
  async prepare(key, input) {
    const entity = target(key);
    if (!notesSlotOf(entity))
      fail(`${refOf(entity)} has no private notes to add an idea to.`);
    const markdown = (input.markdown as string).trim();
    if (!markdown) fail('An idea needs words.');
    if (markdown.length > 4000) fail('An idea is a few lines, not a text.');
    return {
      payload: { kind: 'note', markdown },
      base: null,
      dropped: [],
      assetUuids: [...assetIdsIn(markdown)],
    };
  },
  identity: (payload) => [words(payload.markdown)],
  async apply(key, row, _context, write) {
    const entity = target(key);
    const { markdown } = row.payload as { markdown: string };
    await applyText(
      entity,
      'notes',
      row.actionUuid,
      async (stored) => {
        const idea = await textFromMarkdown(markdown, stored.data);
        return {
          ...(stored.data ?? {}),
          blocks: [
            ...(stored.data?.blocks ?? []),
            ...mergeEditedBlocks([], idea.data.blocks),
          ],
        } as ContentOutputData;
      },
      write,
    );
    return entity;
  },
  evaluate(key, row) {
    const { markdown } = row.payload as { markdown: string };
    return words(currentNotesText(key!)).includes(words(markdown).slice(0, 200))
      ? { state: 'done' }
      : { state: 'open' };
  },
  summary: (payload) => `Note: ${clipped(payload.markdown, 100)}`,
};

export const writeAction: AiActionKindDef<'write'> = {
  kind: 'write',
  reference:
    'A text written at the owner’s request: text (its name, as read_entity gives it — body, notes, description, about), mode new (only into an empty text) | append | replace, and markdown in editing Markdown. Never for rewording the owner’s own words: that is revise.',
  schema: z.object({
    text: z.string(),
    mode: z.enum(['new', 'append', 'replace']).default('append'),
    markdown: z.string(),
  }),
  targets: [
    'project',
    'project-section',
    'event',
    'diary-entry',
    'page',
    'profile',
  ],
  async prepare(key, input) {
    const entity = target(key);
    const text = currentText(entity, input.text);
    if (!text) fail(`${refOf(entity)} has no text "${input.text}".`);
    const markdown = (input.markdown as string).trim();
    if (!markdown) fail('A text needs words.');
    if (input.mode === 'new' && text.data?.blocks.length)
      fail(
        `The text "${input.text}" is not empty: add to it (append) or put a new one in its place (replace).`,
      );
    // Read the way it will be written, so a mistake shows now.
    const written = await textFromMarkdown(markdown, text.data);
    return {
      payload: {
        kind: 'write',
        text: input.text,
        mode: input.mode,
        markdown,
      },
      base: {
        version: text.version,
        // What it writes, told apart from any other text by its content.
        digest: describeHistoryData({ blocks: written.data.blocks }).digest,
        blocks: written.data.blocks.length,
      },
      dropped: written.warnings,
      assetUuids: [...assetIdsIn(markdown)],
    };
  },
  identity: (payload) => [payload.text, payload.mode, words(payload.markdown)],
  async apply(key, row, _context, write) {
    const entity = target(key);
    const payload = row.payload as {
      text: string;
      mode: 'new' | 'append' | 'replace';
      markdown: string;
    };
    await applyText(
      entity,
      payload.text,
      row.actionUuid,
      async (stored) => {
        const written = await textFromMarkdown(payload.markdown, stored.data);
        const before = stored.data?.blocks ?? [];
        const blocks =
          payload.mode === 'append'
            ? [...before, ...mergeEditedBlocks([], written.data.blocks)]
            : payload.mode === 'replace'
              ? mergeEditedBlocks(before, written.data.blocks)
              : mergeEditedBlocks([], written.data.blocks);
        return { ...(stored.data ?? {}), blocks } as ContentOutputData;
      },
      write,
    );
    return entity;
  },
  evaluate(key, row) {
    const payload = row.payload as { text: string; mode: string };
    const base = (row.base ?? {}) as {
      version?: number | null;
      digest?: string;
      blocks?: number;
    };
    const text = currentText(key!, payload.text);
    if (!text) return { state: 'gone' };
    // Done once the text says what it would write — where it would write
    // it — links and marks included, whoever wrote it.
    const blocks = text.data?.blocks ?? [];
    const written =
      payload.mode === 'append' ? blocks.slice(-(base.blocks ?? 0)) : blocks;
    if (
      base.digest &&
      written.length &&
      describeHistoryData({ blocks: written }).digest === base.digest
    )
      return { state: 'done' };
    return text.version === (base.version ?? null)
      ? { state: 'open' }
      : { state: 'stale' };
  },
  summary: (payload) =>
    `${payload.mode === 'append' ? 'Add to' : payload.mode === 'replace' ? 'Rewrite' : 'Write'} ${payload.text}: ${clipped(stripMarks(payload.markdown), 80)}`,
};

/** The parts of a new order a tidy plan makes. */
function tidyParts(
  blocks: ContentOutputData['blocks'],
  plan: { items: TidyItem[]; comments: TidyComment[] },
  reason: string,
): AiRevisePart[] {
  const stats = tidyStats(plan);
  const parts: AiRevisePart[] = [];
  if (stats.moved.length)
    parts.push({
      id: 'order',
      type: 'order',
      moved: stats.moved,
      certainty: 'sure',
      reason,
    });
  plan.items.forEach((item, index) => {
    if (item.type === 'heading')
      parts.push({
        id: `h${index}`,
        type: 'heading',
        item: index,
        text: item.text,
        level: item.level,
        certainty: 'sure',
        reason: '',
      });
    else if (item.type === 'delimiter')
      parts.push({
        id: `d${index}`,
        type: 'delimiter',
        item: index,
        certainty: 'sure',
        reason: '',
      });
    else if (item.removed)
      parts.push({
        id: `r${index}`,
        type: 'removal',
        item: index,
        quote: clipped(
          item.type === 'part'
            ? tidyHtmlText(item.html)
            : tidyBlockText(blocks[item.from]!),
          160,
        ),
        certainty: 'sure',
        reason: item.removed.reason,
      });
  });
  for (const from of stats.split)
    parts.push({
      id: `s${from}`,
      type: 'split',
      from,
      certainty: 'sure',
      reason: '',
    });
  return parts;
}

const correctionInput = z.object({
  find: z.string(),
  replace: z.string(),
  category: z.enum(PROOFREAD_CATEGORIES).default('spelling'),
  certainty: z.enum(['sure', 'unsure']).default('sure'),
  reason: z.string().default(''),
});

/** Parts as decided now: the stored decisions with the owner's latest over them. */
function partStates(
  parts: AiRevisePart[],
  stored: unknown[] | null,
  given?: Record<string, AiRevisePartState>,
): Map<string, AiRevisePartState> {
  const states = new Map<string, AiRevisePartState>(
    parts.map((part) => [part.id, 'pending']),
  );
  for (const row of (stored ?? []) as PartStateRow[])
    if (states.has(row.id)) states.set(row.id, row.state);
  if (given)
    for (const [id, state] of Object.entries(given)) {
      const now = states.get(id);
      if (now && now !== 'applied' && now !== 'stale') states.set(id, state);
    }
  // What the owner said nothing of: a sure part is taken, the rest wait.
  for (const part of parts)
    if (
      states.get(part.id) === 'pending' &&
      part.certainty === 'sure' &&
      !(given && part.id in given)
    )
      states.set(part.id, 'accepted');
  return states;
}

export const reviseAction: AiActionKindDef<'revise'> = {
  kind: 'revise',
  reference:
    'An edit of the owner’s text, decided part by part. text, then either mode proofread with corrections [{ find, replace, category, certainty?, reason }] — local fixes of clear mistakes, find standing once in the text, never typography; category link makes a mention a link to an entity, every word kept — only its first mention in a part of the text, from one level-two heading to the next — or mode order with markdown: the whole text with its blocks moved, split, given headings or a repeat dropped, nothing reworded, with expectedVersion (the version you read), removals [{ quote, reason, duplicateOf? }] and comments [{ quote?, kind, comment }].',
  schema: z.object({
    text: z.string(),
    mode: z.enum(['proofread', 'order']),
    corrections: z.array(correctionInput).optional(),
    markdown: z.string().optional(),
    expectedVersion: z.number().nullable().optional(),
    removals: z
      .array(
        z.object({
          quote: z.string(),
          reason: z.string(),
          duplicateOf: z.string().optional(),
        }),
      )
      .optional(),
    comments: z
      .array(
        z.object({
          quote: z.string().optional(),
          kind: z.enum(TIDY_COMMENT_KINDS),
          comment: z.string(),
        }),
      )
      .optional(),
  }),
  targets: [
    'project',
    'project-section',
    'event',
    'diary-entry',
    'page',
    'profile',
  ],
  async prepare(key, input, context) {
    const entity = target(key);
    const text = currentText(entity, input.text);
    if (!text) fail(`${refOf(entity)} has no text "${input.text}".`);
    if (!text.data?.blocks.length) fail(`The text "${input.text}" is empty.`);
    const dropped: string[] = [];
    if (input.mode === 'order') {
      if (input.markdown === undefined)
        fail('A new order is the whole text, tidied: give markdown.');
      if (
        input.expectedVersion !== undefined &&
        text.version !== input.expectedVersion
      )
        fail(
          'The text has changed since you read it. Read it again and tidy what is there now.',
        );
      const written = await textFromMarkdown(input.markdown, text.data);
      const plan = planTidy(
        text.data.blocks,
        written.data.blocks,
        input.removals ?? [],
        input.comments ?? [],
      );
      if (plan.problems.length) fail(plan.problems.join(' '));
      const parts = tidyParts(text.data.blocks, plan, context.reason);
      if (!parts.length) fail('It leaves the text as it is.');
      return {
        payload: {
          kind: 'revise',
          text: input.text,
          mode: 'order',
          parts,
          plan: { keys: plan.keys, items: plan.items, comments: plan.comments },
        },
        base: { version: text.version },
        dropped: [...written.warnings, ...plan.dropped],
        parts: parts.map((part) => part.id),
      };
    }
    const corrections = (input.corrections ?? []) as z.infer<
      typeof correctionInput
    >[];
    if (!corrections.length) fail('Give the corrections.');
    const kept = correctionsKeptLately(entity, input.text);
    const never = neverOffered(
      corrections.map((c) => correctionFingerprint(entity, input.text, c)),
    );
    const parts: AiRevisePart[] = [];
    for (const correction of corrections) {
      const why = (problem: string) =>
        dropped.push(
          `"${correction.find}" → "${correction.replace}": ${problem}`,
        );
      const fingerprint = correctionFingerprint(entity, input.text, correction);
      if (!correction.find || correction.find === correction.replace) {
        why('changes nothing.');
        continue;
      }
      if (kept.has(fingerprint) || never.has(fingerprint)) {
        why('the owner has kept it as written.');
        continue;
      }
      if (correction.category === 'link') {
        const link = await prepareLinkCorrection(entity, text.data, correction);
        if ('problem' in link) {
          why(link.problem);
          continue;
        }
        const { places } = placeTextEdits(
          text.data,
          [{ id: 'link', find: correction.find }],
          (_id, stored) => stored,
        );
        if (!places.get('link')?.html) {
          why(
            'a link stands only in running text — a paragraph, a list, a quote, a caption — not in a heading or a file’s title.',
          );
          continue;
        }
        parts.push({
          id: `c${parts.length + 1}`,
          type: 'correction',
          category: 'link',
          certainty: correction.certainty,
          reason: correction.reason.slice(0, 200),
          find: correction.find,
          replace: correction.replace,
          replaceHtml: link.replaceHtml,
          replacePlain: plainOfHtml(link.replaceHtml),
        });
        continue;
      }
      const ownWords = keptWordsIn(correction.find);
      if (ownWords.length) {
        why(
          `"${ownWords.join('", "')}" is in the owner's dictionary: written so on purpose.`,
        );
        continue;
      }
      if (editChangesOnlyTypography(correction)) {
        why('it changes only typography, which the site sets itself.');
        continue;
      }
      if (!editIsLocalFix(correction)) {
        why(
          'it rephrases rather than fixes: proofreading changes a few letters or words and keeps them recognisable.',
        );
        continue;
      }
      const prepared = prepareTextEdit(correction);
      if (prepared.links) {
        why(
          'a correction of a mistake adds no link: make a mention a link as a correction of its own, category "link".',
        );
        continue;
      }
      const matches = countTextMatches(text.data, correction.find);
      if (matches !== 1) {
        why(
          matches
            ? `"${correction.find}" stands ${matches} times; give more of the words around it.`
            : `"${correction.find}" is not in the text as one run of words.`,
        );
        continue;
      }
      parts.push({
        id: `c${parts.length + 1}`,
        type: 'correction',
        category: correction.category,
        certainty: correction.certainty,
        reason: correction.reason.slice(0, 200),
        find: correction.find,
        replace: correction.replace,
        replaceHtml: prepared.replaceHtml,
        replacePlain: plainOfHtml(prepared.replaceHtml),
      });
    }
    // Two corrections of the same words cannot both be made.
    const overlapping = overlappingEdits(text.data, parts as Correction[]);
    const apart = parts.filter((part, index) => {
      if (!overlapping.has(index)) return true;
      const correction = part as Correction;
      dropped.push(
        `"${correction.find}" → "${correction.replace}": its words overlap another correction's; make them one.`,
      );
      return false;
    });
    apart.forEach((part, index) => {
      part.id = `c${index + 1}`;
    });
    parts.splice(0, parts.length, ...apart);
    if (!parts.length) fail(`Nothing left to propose: ${dropped.join(' ')}`);
    return {
      payload: { kind: 'revise', text: input.text, mode: 'proofread', parts },
      base: { version: text.version },
      dropped,
      parts: parts.map((part) => part.id),
    };
  },
  identity: (payload) =>
    payload.mode === 'order'
      ? [payload.text, payload.plan?.keys, payload.plan?.items]
      : [
          payload.text,
          payload.parts
            .flatMap((part) =>
              part.type === 'correction' ? [[part.find, part.replace]] : [],
            )
            .sort(),
        ],
  async apply(key, row, context, write) {
    const entity = target(key);
    const payload = row.payload as {
      text: string;
      mode: 'proofread' | 'order';
      parts: AiRevisePart[];
      plan?: { keys: string[]; items: TidyItem[]; comments: TidyComment[] };
    };
    const states = partStates(payload.parts, row.parts, context.parts);
    const taken = takenParts(payload, (id) => {
      const state = states.get(id);
      return state === 'accepted' || state === 'kept' ? state : 'pending';
    });
    if (!taken.size) fail('No part of it is accepted.');
    // A new order lands once: what the owner left is kept as it was.
    if (payload.mode === 'order')
      for (const part of payload.parts)
        states.set(part.id, taken.has(part.id) ? 'accepted' : 'kept');
    else for (const id of taken) states.set(id, 'accepted');
    const problems = new Map<string, string>();
    await applyText(
      entity,
      payload.text,
      row.actionUuid,
      (stored) => {
        const made = applyRevise(stored.data ?? { blocks: [] }, payload, taken);
        if (!made)
          fail(
            'The text has changed too much since this order was made: ask for it again.',
          );
        for (const [id, problem] of made.problems) problems.set(id, problem);
        return made.data;
      },
      (tx, schema, undo) => {
        const parts: PartStateRow[] = payload.parts.map((part) => {
          const problem = problems.get(part.id);
          const state = states.get(part.id)!;
          return problem
            ? { id: part.id, state: 'stale', problem }
            : { id: part.id, state: state === 'accepted' ? 'applied' : state };
        });
        write(tx, schema, undo, {
          parts,
          waiting: parts.some((part) => part.state === 'pending'),
        });
      },
    );
    return entity;
  },
  evaluate(key, row) {
    const payload = row.payload as {
      text: string;
      mode: 'proofread' | 'order';
      parts: AiRevisePart[];
      plan?: { keys: string[] };
    };
    const text = currentText(key!, payload.text);
    if (!text) return { state: 'gone' };
    const stored = new Map(
      ((row.parts ?? []) as PartStateRow[]).map((part) => [part.id, part]),
    );
    const stateOf = (part: AiRevisePart) =>
      stored.get(part.id)?.state ?? 'pending';
    // Accepted is the owner's word, not yet the text's.
    const open = (part: AiRevisePart) =>
      stateOf(part) === 'pending' || stateOf(part) === 'accepted';
    if (!payload.parts.some(open))
      return payload.parts.some((part) => stateOf(part) === 'applied')
        ? { state: 'done' }
        : { state: 'declined' };
    // A new order taken in the editor is marked when the editor saves; here
    // it only goes stale, once the text no longer matches what it was made of.
    if (payload.mode === 'order')
      return payload.plan &&
        alignTidyBase(text.data?.blocks ?? [], payload.plan.keys)
        ? { state: 'open' }
        : { state: 'stale' };
    // A correction no longer standing in the text waits no more: made — in
    // the editor or by the owner's hand — when its words now read as it
    // would have them, and overtaken when they read otherwise.
    const fresh: PartStateRow[] = payload.parts.map((part) =>
      part.type === 'correction' &&
      open(part) &&
      !correctionPending(text.data, part)
        ? {
            id: part.id,
            state: countTextMatches(text.data, part.replacePlain)
              ? 'applied'
              : 'stale',
          }
        : (stored.get(part.id) ?? { id: part.id, state: 'pending' }),
    );
    if (
      !fresh.some(
        (part) => part.state === 'pending' || part.state === 'accepted',
      )
    )
      return fresh.some((part) => part.state === 'applied')
        ? { state: 'done', parts: fresh }
        : { state: 'declined', parts: fresh };
    return { state: 'open', parts: fresh };
  },
  summary(payload) {
    if (payload.mode === 'order')
      return `A new order for ${payload.text}: ${payload.parts.length} parts`;
    const shown = payload.parts
      .flatMap((part) =>
        part.type === 'correction'
          ? [`"${clipped(part.find, 40)}" → "${clipped(part.replace, 40)}"`]
          : [],
      )
      .slice(0, 3);
    const more = payload.parts.length - shown.length;
    return `In ${payload.text}: ${shown.join('; ')}${more ? `; and ${more} more` : ''}`;
  },
};
