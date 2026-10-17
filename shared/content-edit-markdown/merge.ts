import type { ContentOutputBlock } from '../content';
import { editBlockKey, newEditBlockId } from './block-key';

export { editBlockKey };

/**
 * A text written back as editing Markdown, merged onto the text it was read
 * from: every block the writer left as it was stays exactly as stored — its
 * id, its markup, whatever the Markdown could not say — and only what changed
 * is taken from what was written.
 *
 * That is what makes editing a long text safe. A model that fixes one word
 * hands back the whole text; the document that is saved differs from the one
 * stored by that one word, not by every `<strong>` that came back as `<b>`.
 */

/**
 * The longest run of blocks the two texts share, in order: those keep their
 * stored form. The rest is what was written, with ids of its own.
 */
export function mergeEditedBlocks(
  stored: readonly ContentOutputBlock[],
  written: readonly ContentOutputBlock[],
): ContentOutputBlock[] {
  const storedKeys = stored.map(editBlockKey);
  const writtenKeys = written.map(editBlockKey);
  const rows = stored.length;
  const columns = written.length;
  // lengths[i][j]: shared blocks between stored[i..] and written[j..].
  const lengths = Array.from({ length: rows + 1 }, () =>
    new Array<number>(columns + 1).fill(0),
  );
  for (let i = rows - 1; i >= 0; i--)
    for (let j = columns - 1; j >= 0; j--)
      lengths[i]![j] =
        storedKeys[i] === writtenKeys[j]
          ? lengths[i + 1]![j + 1]! + 1
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);

  const used = new Set(
    stored.map((block) => block.id).filter((id): id is string => Boolean(id)),
  );
  const fresh = () => {
    let id = newEditBlockId();
    while (used.has(id)) id = newEditBlockId();
    used.add(id);
    return id;
  };

  const merged: ContentOutputBlock[] = [];
  let i = 0;
  let j = 0;
  while (j < columns) {
    if (i < rows && storedKeys[i] === writtenKeys[j]) {
      merged.push(stored[i]!);
      i++;
      j++;
    } else if (i < rows && lengths[i + 1]![j]! >= lengths[i]![j + 1]!) {
      i++;
    } else {
      merged.push({ ...written[j]!, id: fresh() });
      j++;
    }
  }
  return merged;
}
