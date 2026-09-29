import {
  collectContentAssetUuids,
  contentBlockTextParts,
  contentSemanticKey,
  isContentAssetBlockType,
  type ContentBlockType,
  type ContentOutputBlock,
  type ContentOutputData,
} from './content';

/**
 * How a text would change if another version of it were restored, block by
 * block: what stays, what goes, what comes, and what is rewritten.
 *
 * Blocks are matched by their ids first. Editor.js gives every block an id
 * and keeps it while the block is typed in, restyled or moved, and versions
 * keep the ids, so a paragraph rewritten between two versions is still the
 * same paragraph, wherever the other changes are. A block whose id does not
 * carry over — split off with Enter, converted to another kind, pasted — is
 * matched by what it says: the same content is the same block, and between
 * two matched blocks one of the same kind whose words mostly agree counts as
 * rewritten rather than as one block gone and another come.
 *
 * A rewritten block of text carries its words compared, so what changes
 * inside a paragraph shows at a glance.
 */
export type ContentDiffItem =
  | { kind: 'same'; block: ContentOutputBlock }
  | { kind: 'removed'; block: ContentOutputBlock }
  | { kind: 'added'; block: ContentOutputBlock }
  | {
      kind: 'changed';
      /** The block as the restored version has it. */
      block: ContentOutputBlock;
      /** The block as it is now. */
      previous: ContentOutputBlock;
      /**
       * The block's text compared word by word, when it is a block of text
       * and its text is what changed. Without it the change is elsewhere —
       * formatting, a file, a setting — and both states are shown whole.
       */
      words?: ContentTextDiffPart[];
    };

export interface ContentTextDiffPart {
  kind: 'same' | 'removed' | 'added';
  text: string;
}

/** Blocks whose change is best read as words changed. */
const TEXT_BLOCK_TYPES: ReadonlySet<ContentBlockType> = new Set([
  'paragraph',
  'header',
  'quote',
  'list',
]);

/**
 * More than this share of two blocks' words must agree for one to be the
 * other rewritten: two short lines sharing one word of two are not.
 */
const REWRITE_SIMILARITY = 0.5;

/**
 * Past this many cells two sequences are compared only where their ends
 * agree; whatever differs in the middle is shown as replaced.
 */
const ALIGN_LIMIT = 4_000_000;

/**
 * A gap whose blocks that go times blocks that come exceed this is not
 * searched for rewritten blocks: its blocks simply go and come.
 */
const PAIRING_LIMIT = 10_000;

interface DiffBlock {
  block: ContentOutputBlock;
  key: string;
}

export function diffContentBlocks(
  current: ContentOutputData,
  version: ContentOutputData,
  options: {
    /** Typography applied to the texts before their words are compared. */
    formatText?: (text: string) => string;
  } = {},
): ContentDiffItem[] {
  const format = options.formatText ?? ((text: string) => text);
  const before = current.blocks.map(describe);
  const after = version.blocks.map(describe);
  const shared = sharedIds(current.blocks, version.blocks);
  const identity = ({ block, key }: DiffBlock) =>
    block.id && shared.has(block.id) ? `#${block.id}` : `=${key}`;

  const items: ContentDiffItem[] = [];
  let i = 0;
  let j = 0;
  for (const [matchI, matchJ] of [
    ...align(before.map(identity), after.map(identity)),
    [before.length, after.length] as const,
  ]) {
    items.push(
      ...settleGap(before.slice(i, matchI), after.slice(j, matchJ), format),
    );
    if (matchI < before.length)
      items.push(...matched(before[matchI]!, after[matchJ]!, format));
    i = matchI + 1;
    j = matchJ + 1;
  }
  return items;
}

function describe(block: ContentOutputBlock): DiffBlock {
  return { block, key: blockKey(block) };
}

function blockKey(block: ContentOutputBlock) {
  // A private section's edge means nothing on its own, and normalizing it
  // alone would drop it; its section and side are what it says.
  if (block.type === 'privateSectionBoundary')
    return `boundary:${JSON.stringify(block.data)}`;
  return contentSemanticKey({ blocks: [block] });
}

/** Ids naming exactly one block in each text. */
function sharedIds(
  left: readonly ContentOutputBlock[],
  right: readonly ContentOutputBlock[],
) {
  const unique = (blocks: readonly ContentOutputBlock[]) => {
    const counts = new Map<string, number>();
    for (const { id } of blocks)
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    return new Set(
      [...counts].filter(([, count]) => count === 1).map(([id]) => id),
    );
  };
  const rightIds = unique(right);
  return new Set([...unique(left)].filter((id) => rightIds.has(id)));
}

type Format = (text: string) => string;

function matched(
  before: DiffBlock,
  after: DiffBlock,
  format: Format,
): ContentDiffItem[] {
  if (before.key === after.key) return [{ kind: 'same', block: after.block }];
  // A private section's edge is drawn as a line, never as a rewrite.
  if (
    before.block.type === 'privateSectionBoundary' ||
    after.block.type === 'privateSectionBoundary'
  )
    return [
      { kind: 'removed', block: before.block },
      { kind: 'added', block: after.block },
    ];
  return [rewritten(before.block, after.block, format)];
}

function rewritten(
  previous: ContentOutputBlock,
  block: ContentOutputBlock,
  format: Format,
): ContentDiffItem {
  if (previous.type === block.type && TEXT_BLOCK_TYPES.has(block.type)) {
    const before = format(blockText(previous));
    const after = format(blockText(block));
    if (before !== after)
      return {
        kind: 'changed',
        block,
        previous,
        words: diffContentText(before, after),
      };
  }
  return { kind: 'changed', block, previous };
}

/**
 * Blocks between two matched ones. The most alike pair of a block that goes
 * and a block of its kind that comes counts as one block rewritten, if they
 * are alike enough; the blocks before the pair and after it are settled the
 * same way. So a block is paired with its closest match rather than with
 * whichever similar block happens to come first, pairs never cross, and
 * neither text changes its order. What stays unpaired goes, then comes.
 */
function settleGap(removed: DiffBlock[], added: DiffBlock[], format: Format) {
  const scores =
    removed.length * added.length <= PAIRING_LIMIT
      ? removed.map((gone) =>
          added.map((come) => similarity(gone.block, come.block)),
        )
      : undefined;
  const items: ContentDiffItem[] = [];
  const settle = (
    removedFrom: number,
    removedTo: number,
    addedFrom: number,
    addedTo: number,
  ) => {
    let best: [number, number] | undefined;
    let bestScore = REWRITE_SIMILARITY;
    for (let i = removedFrom; scores && i < removedTo; i++) {
      for (let j = addedFrom; j < addedTo; j++) {
        const score = scores[i]![j]!;
        if (score > bestScore) {
          best = [i, j];
          bestScore = score;
        }
      }
    }
    if (!best) {
      for (let i = removedFrom; i < removedTo; i++)
        items.push({ kind: 'removed', block: removed[i]!.block });
      for (let j = addedFrom; j < addedTo; j++)
        items.push({ kind: 'added', block: added[j]!.block });
      return;
    }
    const [i, j] = best;
    settle(removedFrom, i, addedFrom, j);
    items.push(...matched(removed[i]!, added[j]!, format));
    settle(i + 1, removedTo, j + 1, addedTo);
  };
  settle(0, removed.length, 0, added.length);
  return items;
}

/** How alike two blocks are, from 0 to 1; blocks of different kinds are not. */
function similarity(left: ContentOutputBlock, right: ContentOutputBlock) {
  if (left.type !== right.type) return 0;
  if (left.type === 'privateSectionBoundary' || left.type === 'delimiter')
    return 0;
  // The same file with another caption or layout is the same block.
  if (isContentAssetBlockType(left.type)) {
    const files = new Set(collectContentAssetUuids({ blocks: [left] }));
    if (
      collectContentAssetUuids({ blocks: [right] }).some((uuid) =>
        files.has(uuid),
      )
    )
      return 1;
  }
  const leftWords = words(blockText(left));
  const rightWords = words(blockText(right));
  if (!leftWords.length || !rightWords.length) return 0;
  const counts = new Map<string, number>();
  for (const word of leftWords) counts.set(word, (counts.get(word) ?? 0) + 1);
  let common = 0;
  for (const word of rightWords) {
    const count = counts.get(word) ?? 0;
    if (!count) continue;
    common++;
    counts.set(word, count - 1);
  }
  return (2 * common) / (leftWords.length + rightWords.length);
}

function blockText(block: ContentOutputBlock) {
  return contentBlockTextParts(block).join('\n');
}

function words(text: string) {
  return (text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []) as string[];
}

/**
 * Two texts compared word by word: what stays, what goes and what comes.
 * A space alone between two changes is folded into them, so a rewritten
 * phrase reads as one phrase gone and one come rather than word by word.
 */
export function diffContentText(
  before: string,
  after: string,
): ContentTextDiffPart[] {
  const left = tokens(before);
  const right = tokens(after);
  const raw: ContentTextDiffPart[] = [];
  let i = 0;
  let j = 0;
  for (const [matchI, matchJ] of [
    ...align(left, right),
    [left.length, right.length] as const,
  ]) {
    for (; i < matchI; i++) raw.push({ kind: 'removed', text: left[i]! });
    for (; j < matchJ; j++) raw.push({ kind: 'added', text: right[j]! });
    if (matchI < left.length) raw.push({ kind: 'same', text: left[matchI]! });
    i = matchI + 1;
    j = matchJ + 1;
  }

  // Runs of stays and of changes, with a lone space between changes counted
  // as changed.
  const runs: { same: boolean; parts: ContentTextDiffPart[] }[] = [];
  for (const part of merge(raw)) {
    const same = part.kind === 'same';
    const last = runs.at(-1);
    if (last && last.same === same) last.parts.push(part);
    else runs.push({ same, parts: [part] });
  }
  for (let index = 1; index < runs.length - 1; index++) {
    const run = runs[index]!;
    if (!run.same || !/^\s+$/.test(run.parts[0]!.text)) continue;
    const text = run.parts[0]!.text;
    const joined = [
      ...runs[index - 1]!.parts,
      { kind: 'removed', text },
      { kind: 'added', text },
      ...runs[index + 1]!.parts,
    ] as ContentTextDiffPart[];
    runs.splice(index - 1, 3, { same: false, parts: joined });
    index--;
  }

  // Within a run of changes, what goes reads before what comes.
  return merge(
    runs.flatMap((run) =>
      run.same
        ? run.parts
        : [
            ...run.parts.filter((part) => part.kind === 'removed'),
            ...run.parts.filter((part) => part.kind === 'added'),
          ],
    ),
  );
}

function tokens(text: string) {
  return (text.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ??
    []) as string[];
}

function merge(parts: ContentTextDiffPart[]) {
  const merged: ContentTextDiffPart[] = [];
  for (const part of parts) {
    const last = merged.at(-1);
    if (last?.kind === part.kind) last.text += part.text;
    else merged.push({ ...part });
  }
  return merged;
}

/**
 * The pairs of positions two sequences share, in order: the longest common
 * subsequence, after the ends they share outright. Past the limit only the
 * shared ends are matched.
 */
function align(left: readonly string[], right: readonly string[]) {
  let start = 0;
  while (
    start < left.length &&
    start < right.length &&
    left[start] === right[start]
  )
    start++;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (
    leftEnd > start &&
    rightEnd > start &&
    left[leftEnd - 1] === right[rightEnd - 1]
  ) {
    leftEnd--;
    rightEnd--;
  }

  const pairs: [number, number][] = [];
  for (let index = 0; index < start; index++) pairs.push([index, index]);

  const rows = leftEnd - start;
  const columns = rightEnd - start;
  if (rows && columns && rows * columns <= ALIGN_LIMIT) {
    // Filled from the end so it can be walked from the start.
    const width = columns + 1;
    const lengths = new Uint32Array((rows + 1) * width);
    for (let a = rows - 1; a >= 0; a--) {
      for (let b = columns - 1; b >= 0; b--) {
        lengths[a * width + b] =
          left[start + a] === right[start + b]
            ? lengths[(a + 1) * width + b + 1]! + 1
            : Math.max(
                lengths[(a + 1) * width + b]!,
                lengths[a * width + b + 1]!,
              );
      }
    }
    let a = 0;
    let b = 0;
    while (a < rows && b < columns) {
      if (left[start + a] === right[start + b]) {
        pairs.push([start + a, start + b]);
        a++;
        b++;
      } else if (lengths[(a + 1) * width + b]! >= lengths[a * width + b + 1]!)
        a++;
      else b++;
    }
  }

  for (let offset = 0; leftEnd + offset < left.length; offset++)
    pairs.push([leftEnd + offset, rightEnd + offset]);
  return pairs;
}
