import {
  contentBlockFiles,
  contentBlockTextParts,
  isContentFileBlockType,
  type ContentAssetData,
  type ContentBlockType,
  type ContentOutputBlock,
} from './content';

/**
 * What changed in a block besides its words, for a comparison to say: a
 * heading's level, a list's style, a file added, a caption rewritten. Its
 * words, when they changed, are compared on their own (`content-diff.ts`).
 */
export type BlockChange =
  | { what: 'type'; from: ContentBlockType; to: ContentBlockType }
  | { what: 'level'; from: number; to: number }
  | { what: 'style'; from: string; to: string }
  | { what: 'spoiler'; on: boolean }
  | {
      what:
        | 'numbering'
        | 'checks'
        | 'markup'
        | 'alignment'
        | 'layout'
        | 'title'
        | 'caption'
        | 'files'
        | 'target'
        | 'note'
        | 'other';
    };

/** One file of a file block compared: as it stays, comes or goes. */
export interface BlockFileChange {
  asset: ContentAssetData;
  change: 'same' | 'added' | 'removed';
}

/** Blocks whose words are a run of inline markup. */
const RUNNING_TEXT = new Set<string>(['paragraph', 'header', 'quote', 'list']);

type Data = Record<string, unknown>;

function dataOf(block: ContentOutputBlock): Data {
  return (block.data ?? {}) as Data;
}

/** The inline markup a block of running text holds, every item of a list too. */
function markupOf(block: ContentOutputBlock): string {
  const data = dataOf(block);
  if (block.type !== 'list')
    return `${String(data.text ?? '')}\n${String(data.caption ?? '')}`;
  const items: string[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      items.push(String((item as Data)?.content ?? ''));
      walk((item as Data)?.items);
    }
  };
  walk(data.items);
  return items.join('\n');
}

/** A list's ticks, item by item, nested ones in order. */
function checksOf(items: unknown, into: boolean[] = []): boolean[] {
  if (!Array.isArray(items)) return into;
  for (const item of items) {
    into.push(Boolean(((item as Data)?.meta as Data | undefined)?.checked));
    checksOf((item as Data)?.items, into);
  }
  return into;
}

/** A list's numbering: where it starts and how it counts. */
function numberingOf(data: Data) {
  const meta = (data.meta ?? {}) as Data;
  return `${String(meta.start ?? '')}:${String(meta.counterType ?? '')}`;
}

/** A file block's own title or caption, and each of its files' by file. */
function fileWordsOf(data: Data, field: 'title' | 'caption') {
  const items = Array.isArray(data.items) ? (data.items as Data[]) : [];
  return {
    own: String(data[field] ?? ''),
    files: new Map(
      items.map((item) => [
        uuidOf(item?.asset) ?? '',
        String(item?.[field] ?? ''),
      ]),
    ),
  };
}

/**
 * Whether a title or a caption changed: the block's own, or that of a file
 * it holds in both states — a file that comes or goes is a change of files.
 */
function fileWordsChanged(was: Data, now: Data, field: 'title' | 'caption') {
  const before = fileWordsOf(was, field);
  const after = fileWordsOf(now, field);
  if (before.own !== after.own) return true;
  for (const [uuid, words] of after.files)
    if (before.files.has(uuid) && before.files.get(uuid) !== words) return true;
  return false;
}

function uuidOf(asset: unknown): string | undefined {
  const uuid = (asset as ContentAssetData | null)?.assetUuid;
  return typeof uuid === 'string' && uuid ? uuid : undefined;
}

function filesOf(block: ContentOutputBlock | undefined): ContentAssetData[] {
  if (!block) return [];
  return contentBlockFiles(block).filter((asset): asset is ContentAssetData =>
    Boolean(uuidOf(asset)),
  );
}

function targetOf(block: ContentOutputBlock): string {
  const data = dataOf(block);
  if (block.type === 'externalLink') return String(data.url ?? '');
  if (block.type === 'entityLink')
    return `${String(data.entityType)}:${String(data.entityId)}#${String(data.fragment ?? '')}`;
  const { provider, videoId } = data;
  return `${String(provider ?? '')}:${String(videoId ?? '')}`;
}

/**
 * What changed in a block between two of its states, besides its words; a
 * change nothing here names is `other`. Two states that differ in their
 * words alone give none.
 */
export function blockChanges(
  previous: ContentOutputBlock,
  block: ContentOutputBlock,
): BlockChange[] {
  const changes: BlockChange[] = [];
  const spoiler = (each: ContentOutputBlock) =>
    'tunes' in each && Boolean(each.tunes?.spoiler);
  if (previous.type !== block.type)
    changes.push({ what: 'type', from: previous.type, to: block.type });
  if (spoiler(previous) !== spoiler(block))
    changes.push({ what: 'spoiler', on: spoiler(block) });
  const was = dataOf(previous);
  const now = dataOf(block);
  const differs = (field: string) =>
    JSON.stringify(was[field] ?? null) !== JSON.stringify(now[field] ?? null);

  if (previous.type === block.type) {
    switch (block.type) {
      case 'header':
        if (differs('level'))
          changes.push({
            what: 'level',
            from: Number(was.level),
            to: Number(now.level),
          });
        break;
      case 'list':
        if (differs('style'))
          changes.push({
            what: 'style',
            from: String(was.style ?? ''),
            to: String(now.style ?? ''),
          });
        else if (numberingOf(was) !== numberingOf(now))
          changes.push({ what: 'numbering' });
        if (
          was.style === 'checklist' &&
          now.style === 'checklist' &&
          checksOf(was.items).join() !== checksOf(now.items).join()
        )
          changes.push({ what: 'checks' });
        break;
      case 'quote':
        if (differs('alignment')) changes.push({ what: 'alignment' });
        break;
      case 'contentMedia':
        if (differs('layout')) changes.push({ what: 'layout' });
        break;
      case 'externalLink':
      case 'entityLink':
      case 'integration':
        if (targetOf(previous) !== targetOf(block))
          changes.push({ what: 'target' });
        if (differs('note')) changes.push({ what: 'note' });
        break;
    }
    if (isContentFileBlockType(block.type)) {
      if (fileWordsChanged(was, now, 'title')) changes.push({ what: 'title' });
      if (fileWordsChanged(was, now, 'caption'))
        changes.push({ what: 'caption' });
      const before = filesOf(previous).map(uuidOf).join();
      const after = filesOf(block).map(uuidOf).join();
      if (before !== after) changes.push({ what: 'files' });
    }
    // The same words dressed otherwise: bold, a link, a spoiler in a line.
    if (
      RUNNING_TEXT.has(block.type) &&
      markupOf(previous) !== markupOf(block) &&
      contentBlockTextParts(previous).join('\n') ===
        contentBlockTextParts(block).join('\n')
    )
      changes.push({ what: 'markup' });
  }
  return changes;
}

/**
 * The files of a block compared with what it held: in its new order those
 * that stay and those that come, then those that go. A block that comes or
 * goes whole brings or takes all of its files.
 */
export function blockFileChanges(
  previous: ContentOutputBlock | undefined,
  block: ContentOutputBlock | undefined,
): BlockFileChange[] {
  const before = filesOf(previous);
  const after = filesOf(block);
  if (!previous)
    return after.map((asset) => ({ asset, change: 'added' as const }));
  if (!block)
    return before.map((asset) => ({ asset, change: 'removed' as const }));
  const held = new Set(before.map(uuidOf));
  const holds = new Set(after.map(uuidOf));
  return [
    ...after.map((asset): BlockFileChange => ({
      asset,
      change: held.has(uuidOf(asset)) ? 'same' : 'added',
    })),
    ...before
      .filter((asset) => !holds.has(uuidOf(asset)))
      .map((asset): BlockFileChange => ({ asset, change: 'removed' })),
  ];
}
