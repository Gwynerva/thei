import type { ContentOutputBlock } from '../content';

/**
 * What identifies a block of a stored text, without anything that reads or
 * writes Markdown: light enough for the admin pages, which compare and
 * rearrange blocks the same way the server does.
 */

const ID_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** An id of the shape Editor.js gives a block, for what has none yet. */
export function newEditBlockId(): string {
  let id = '';
  const values = crypto.getRandomValues(new Uint8Array(10));
  for (const value of values) id += ID_ALPHABET[value % ID_ALPHABET.length];
  return id;
}

/**
 * What a block says, with the differences that say nothing taken out: the
 * spelling of the same markup, a line break at either end of a text, a bare
 * ampersand, the meta an ordered list is assumed to have. Two blocks with the
 * same key are the same block for a reader.
 */
export function editBlockKey(
  block: Pick<ContentOutputBlock, 'type' | 'data' | 'tunes'>,
): string {
  const data = canonicalValue(block.data) as Record<string, unknown>;
  if (block.type === 'list' && data.style === 'ordered') {
    const meta = (data.meta ?? {}) as Record<string, unknown>;
    data.meta = {
      start: meta.start ?? 1,
      counterType: meta.counterType ?? 'numeric',
    };
  }
  return JSON.stringify([block.type, data, block.tunes?.spoiler === true]);
}

function canonicalValue(value: unknown): unknown {
  if (typeof value === 'string') return canonicalMarkup(value);
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      // A gallery item's id is the writer's to keep, like a block's.
      if (key === 'id') continue;
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined || item === '') continue;
      result[key] = canonicalValue(item);
    }
    return result;
  }
  return value;
}

export function canonicalMarkup(value: string): string {
  return value
    .replace(/<(\/?)strong>/g, '<$1b>')
    .replace(/<(\/?)em>/g, '<$1i>')
    .replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replace(/^(?:<br>)+|(?:<br>)+$/g, '');
}
