import type { ContentOutputData } from './content';
import type { AiRevisePart } from './ai-actions';
import type { TidyComment, TidyItem } from './ai-revise';
import { decodeHtmlEntities } from './content-edit-markdown/html';
import { mergeEditedBlocks } from './content-edit-markdown/merge';
import {
  applyPreparedTextEdits,
  type PreparedTextEdit,
} from './content-edit-markdown/patch-core';
import { applyTidy, type TidyChoices } from './content-edit-markdown/tidy';
import { parseTheiLinkUrl } from './content-edit-markdown/links';
import { contentLinkFrom, retargetContentLink } from './content-link-locate';

/**
 * An AI's edit of a text, made with the parts the owner took: one way for
 * the screen it is gone through on and for the server that applies it, so
 * what the owner sees taken is what the text becomes.
 */

export type Correction = Extract<AiRevisePart, { type: 'correction' }>;
export type Relink = Extract<AiRevisePart, { type: 'relink' }>;

export interface RevisePayload {
  mode: 'proofread' | 'relink' | 'order';
  parts: readonly AiRevisePart[];
  plan?: { keys: string[]; items: TidyItem[]; comments?: TidyComment[] };
}

/** The words a reader sees of stored inline markup. */
export function plainOfHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ''));
}

/** A correction as a prepared edit: what it puts in each kind of field. */
function correctionEdit(part: Correction): PreparedTextEdit {
  return {
    find: part.find,
    replace: part.replace,
    replaceHtml: part.replaceHtml,
    replacePlain: part.replacePlain,
    links: part.category === 'link',
  };
}

/** The parts of a new order that stand on its moves. */
const ON_THE_ORDER = new Set(['heading', 'delimiter', 'removal', 'split']);

/**
 * Which parts are taken. A new order's heading, removal or split stands on
 * its moves: taking one takes the moves with it, and the moves left as they
 * were leave the rest as it is too.
 */
export function takenParts(
  payload: Pick<RevisePayload, 'parts'>,
  decision: (id: string) => 'pending' | 'accepted' | 'kept',
): Set<string> {
  const taken = new Set(
    payload.parts
      .filter((part) => decision(part.id) === 'accepted')
      .map((part) => part.id),
  );
  const order = payload.parts.find((part) => part.type === 'order');
  if (!order) return taken;
  if (decision(order.id) === 'kept') return new Set();
  if (
    payload.parts.some(
      (part) => ON_THE_ORDER.has(part.type) && taken.has(part.id),
    )
  )
    taken.add(order.id);
  return taken;
}

/** What a tidy takes of a new order: a part not taken is undone. */
export function orderChoices(
  parts: readonly AiRevisePart[],
  taken: (part: AiRevisePart) => boolean,
): TidyChoices {
  const choices = {
    skip: [] as number[],
    keep: [] as number[],
    whole: [] as number[],
  };
  for (const part of parts) {
    if (taken(part)) continue;
    if (part.type === 'heading' || part.type === 'delimiter')
      choices.skip.push(part.item);
    else if (part.type === 'removal') choices.keep.push(part.item);
    else if (part.type === 'split') choices.whole.push(part.from);
  }
  return choices;
}

/**
 * The text with its links mended: each taken part's link pointed where it
 * would have it, or taken off — as long as it still leads where the part
 * found it leading. Each is found anew by where it leads and its words, so
 * one taken off moves no other.
 */
function applyRelinks(
  data: ContentOutputData,
  parts: readonly Relink[],
): { data: ContentOutputData; problems: Map<string, string> } {
  const problems = new Map<string, string>();
  let text = data;
  for (const part of parts) {
    const now = contentLinkFrom(text, part);
    const to = part.to ? parseTheiLinkUrl(part.to) : null;
    const made =
      now && to !== undefined
        ? retargetContentLink(text, now.id, to)
        : undefined;
    if (!made) {
      problems.set(part.id, 'The link has changed since: it stays as it is.');
      continue;
    }
    text = made;
  }
  return { data: text, problems };
}

/**
 * The text with the parts taken, and the parts that could not be made — a
 * correction whose words are gone, a split of a paragraph changed since, a
 * removal of a block changed since. Undefined when a new order no longer
 * fits the text at all.
 */
export function applyRevise(
  data: ContentOutputData,
  payload: RevisePayload,
  taken: ReadonlySet<string>,
): { data: ContentOutputData; problems: Map<string, string> } | undefined {
  const problems = new Map<string, string>();
  const isTaken = (part: AiRevisePart) => taken.has(part.id);
  let text = data;
  if (payload.mode === 'order' && payload.plan && payload.parts.some(isTaken)) {
    const tidied = applyTidy(
      text.blocks,
      payload.plan,
      orderChoices(payload.parts, isTaken),
    );
    if (!tidied) return undefined;
    for (const part of payload.parts) {
      if (!isTaken(part)) continue;
      if (part.type === 'split' && tidied.keptWhole.includes(part.from))
        problems.set(
          part.id,
          'The paragraph has changed since: it stays whole.',
        );
      if (part.type === 'removal' && tidied.keptRemoved.includes(part.item))
        problems.set(part.id, 'The block has changed since: it stays.');
    }
    text = { ...text, blocks: tidied.blocks };
  }
  const relinks = payload.parts.filter(
    (part): part is Relink => part.type === 'relink' && isTaken(part),
  );
  if (relinks.length) {
    const mended = applyRelinks(text, relinks);
    for (const [id, problem] of mended.problems) problems.set(id, problem);
    text = mended.data;
  }
  const corrections = payload.parts.filter(
    (part): part is Correction => part.type === 'correction' && isTaken(part),
  );
  if (corrections.length) {
    const edited = applyPreparedTextEdits(
      text,
      corrections.map(correctionEdit),
    );
    edited.outcomes.forEach((outcome, index) => {
      if (!outcome.count)
        problems.set(
          corrections[index]!.id,
          outcome.problem ?? 'Its words are not in the text now.',
        );
    });
    text = {
      ...edited.data,
      blocks: mergeEditedBlocks(text.blocks, edited.data.blocks),
    };
  }
  return { data: text, problems };
}
