import type { ContentOutputBlock, ContentOutputData } from './content';
import {
  editBlockKey,
  newEditBlockId,
} from './content-edit-markdown/block-key';

/**
 * A stored block has an id of its own: a link, a find of the search and a
 * heading's anchor name a place of a text by it. The editor gives every block
 * one; a text written any other way — as editing Markdown, by a script —
 * arrives with none, and gets them here, as it is saved. A block that repeats
 * the id of a block before it is as one without: the first keeps the id.
 *
 * A block that says what a stored one says takes that one's id, in order, so
 * a text handed back whole keeps the ids its places are known by. The rest
 * get ids of the editor's own shape. A text whose blocks all have ids, no two
 * the same, is returned as it is, the very object.
 *
 * A block given an id is written as a save stores one, the id first, whether
 * it came with an `id` key or — read from the database — with none: the same
 * text saved again is then the same bytes, and counts as no change.
 */
export function giveBlockIds(
  data: ContentOutputData,
  stored?: Pick<ContentOutputData, 'blocks'> | null,
): ContentOutputData {
  const used = new Set<string>();
  // Whether a block keeps the id it came with: it has one nothing before it has.
  const keeps = data.blocks.map((block) => {
    if (!block.id || used.has(block.id)) return false;
    used.add(block.id);
    return true;
  });
  if (keeps.every(Boolean)) return data;
  // The ids of the stored blocks nothing written claims, by what they say.
  const free = new Map<string, string[]>();
  for (const block of stored?.blocks ?? []) {
    if (!block.id || used.has(block.id)) continue;
    const key = editBlockKey(block);
    free.set(key, [...(free.get(key) ?? []), block.id]);
  }
  const fresh = () => {
    let id = newEditBlockId();
    while (used.has(id)) id = newEditBlockId();
    return id;
  };
  const blocks = data.blocks.map((block, index): ContentOutputBlock => {
    if (keeps[index]) return block;
    let id = free.get(editBlockKey(block))?.shift();
    if (!id || used.has(id)) id = fresh();
    used.add(id);
    const { id: _replaced, ...rest } = block;
    return { id, ...rest };
  });
  return { ...data, blocks };
}
