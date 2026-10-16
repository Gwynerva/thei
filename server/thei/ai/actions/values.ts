import type { ContentOutputData } from '#layers/thei/shared/content';
import {
  applyPreparedTextEdits,
  makesLinkOnly,
  placeTextEdits,
  type TextEdit,
} from '#layers/thei/shared/content-edit-markdown/patch-core';
import { prepareTextEdit } from '#layers/thei/shared/content-edit-markdown/patch';
import { EntityPatchError, refuse as fail } from '../../entity-patch/text';
import type { EntityKey } from '../../entity-kinds';
import { normalizeSynonyms } from '#layers/thei/shared/synonyms';
import { checkedInlineHtml } from '../../mcp/text-input';

/**
 * Values an action proposes, checked as the site stores them.
 */

const PLAIN_FIELDS = new Set([
  'title',
  'summary',
  'reminder',
  'description',
  'slogan',
]);

/**
 * A field's value as the site stores it, or a refusal; synonyms as the
 * entity titled `title` keeps them.
 */
export function checkFieldValue(
  field: string,
  value: unknown,
  title = '',
): string | boolean | string[] {
  if (field === 'showcase' || field === 'cv') {
    if (typeof value !== 'boolean') fail(`${field} takes true or false.`);
    return value;
  }
  if (field === 'synonyms') {
    const synonyms = normalizeSynonyms(value, title);
    if (typeof synonyms === 'string') fail(`synonyms: ${synonyms}.`);
    return synonyms;
  }
  if (PLAIN_FIELDS.has(field)) {
    if (typeof value !== 'string') fail(`${field} takes text.`);
    const text = value.replace(/\s+/g, ' ').trim();
    if (!text && field === 'title') fail('A title cannot be empty.');
    return text.slice(0, field === 'reminder' ? 500 : 2000);
  }
  fail(`${field} is not a field an action can set on its own.`);
}

export function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

const FILE_FIELDS = new Set(['icon', 'banner', 'favicon', 'file']);

/**
 * The library files a proposal brings in: by field — an icon, a banner, a
 * file of a list — and inside texts, `::media{asset="<id>"}` and the like.
 * They are held from cleanup while the action waits, so a file uploaded for
 * it stays.
 */
export function assetIdsIn(value: unknown, into = new Set<string>()) {
  if (typeof value === 'string')
    for (const match of value.matchAll(/\{[^}]*\basset="?([\w-]+)"?/g))
      into.add(match[1]!);
  else if (Array.isArray(value))
    for (const item of value) assetIdsIn(item, into);
  else if (value && typeof value === 'object')
    for (const [field, item] of Object.entries(value)) {
      if (FILE_FIELDS.has(field) && typeof item === 'string' && item)
        into.add(item);
      else assetIdsIn(item, into);
    }
  return into;
}

/**
 * A mention made a link: the words stay as they are, and only the markup of
 * a link to an entity of the site is new. Its stored markup is worked out
 * here, diary days named by id, so it is applied as it is.
 */
export async function prepareLinkCorrection(
  key: EntityKey,
  data: ContentOutputData,
  correction: Pick<TextEdit, 'find' | 'replace'>,
): Promise<{ replaceHtml: string } | { problem: string }> {
  if (!makesLinkOnly(correction))
    return {
      problem:
        'a link keeps every word as it is and only makes some of them a link to an entity of this site: "[Parapet](thei:project/<id>)".',
    };
  const prepared = prepareTextEdit(correction);
  const [outcome] = applyPreparedTextEdits(data, [prepared]).outcomes;
  if (!outcome?.count)
    return { problem: outcome?.problem ?? 'its words are not in the text.' };
  let replaceHtml: string;
  try {
    replaceHtml = await checkedInlineHtml(prepared.replaceHtml);
  } catch (error) {
    if (error instanceof EntityPatchError) return { problem: error.message };
    throw error;
  }
  if (
    replaceHtml.includes(
      `data-entity-type="${key.kind}" data-entity-id="${key.id}"`,
    )
  )
    return { problem: 'a text does not link to its own entity.' };
  if (linkedAbove(data, correction.find, replaceHtml))
    return {
      problem:
        'that entity is linked already above, in this part of the text: a link stands on its first mention, and again only after a heading of its own.',
    };
  return { replaceHtml };
}

/**
 * Whether the entity a new link points to is linked already in the part of
 * the text the words stand in: from the heading of the second level before
 * them, down to their own block. A link stands on the first mention; a
 * part of its own may link again.
 */
function linkedAbove(data: ContentOutputData, find: string, html: string) {
  const target = /data-entity-type="([^"]+)" data-entity-id="([^"]+)"/.exec(
    html,
  );
  if (!target) return false;
  const { places } = placeTextEdits(data, [{ id: 'link', find }], (_, s) => s);
  const place = places.get('link');
  if (!place) return false;
  const mark = `data-entity-type="${target[1]}" data-entity-id="${target[2]}"`;
  for (let index = place.block; index >= 0; index--) {
    const block = data.blocks[index]!;
    if (JSON.stringify(block.data).includes(mark.replaceAll('"', '\\"')))
      return true;
    if (
      index < place.block &&
      block.type === 'header' &&
      (block.data as { level?: number }).level === 2
    )
      return false;
  }
  return false;
}
