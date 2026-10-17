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
import { normalizeHeadingText } from '#layers/thei/shared/terminal-punctuation';
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
    // A title is a heading: settled as its save settles it.
    return field === 'title'
      ? normalizeHeadingText(text.slice(0, 2000))
      : text.slice(0, field === 'reminder' ? 500 : 2000);
  }
  fail(`${field} is not a field an action can set on its own.`);
}

export function sameValue(left: unknown, right: unknown) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

/** The fields a file stands in, as a change names them and a form keeps them. */
const FILE_FIELDS = new Set(['icon', 'banner', 'favicon', 'file', 'assetUuid']);

/**
 * The library files a proposal brings in, or a change leaves behind: by
 * field — an icon, a banner, a file of a list, as a change names them or as
 * a form keeps them (`iconAssetUuid`, `otherAssets[].assetUuid`, a file of a
 * stored text) — and inside texts, `::media{asset="<id>"}` and the like.
 * They are held from cleanup while the action waits, or may be undone, so a
 * file uploaded for it, or one it took away, stays.
 */
export function assetIdsIn(value: unknown, into = new Set<string>()) {
  if (typeof value === 'string')
    for (const match of value.matchAll(/\{[^}]*\basset="?([\w-]+)"?/g))
      into.add(match[1]!);
  else if (Array.isArray(value))
    for (const item of value) assetIdsIn(item, into);
  else if (value && typeof value === 'object')
    for (const [field, item] of Object.entries(value)) {
      if (
        (FILE_FIELDS.has(field) || field.endsWith('AssetUuid')) &&
        typeof item === 'string' &&
        item
      )
        into.add(item);
      else assetIdsIn(item, into);
    }
  return into;
}

/**
 * The most words a model may make a link: a link is the few words that say
 * where it leads — a name, the words that mean that place — never a whole
 * sentence, as on the web at large.
 */
const LINK_WORDS_MAX = 8;

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
  if (
    [...correction.replace.matchAll(/\[([^\]]*)\]\(thei:/g)].some(
      (match) => match[1]!.trim().split(/\s+/).length > LINK_WORDS_MAX,
    )
  )
    return {
      problem: `a link is the few words that say most plainly where it leads — at most ${LINK_WORDS_MAX} — not a sentence.`,
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
  if (linkedInPart(data, correction.find, replaceHtml))
    return {
      problem:
        'that entity is linked already in this part of the text: a part links an entity once, on its first mention, and again only after a heading of its own.',
    };
  return { replaceHtml };
}

/**
 * Whether the entity a new link points to is linked already in the part of
 * the text the words stand in: from the heading of the second level before
 * them to the next one. A part links an entity once, on its first mention;
 * a part of its own may link again.
 */
function linkedInPart(data: ContentOutputData, find: string, html: string) {
  const target = /data-entity-type="([^"]+)" data-entity-id="([^"]+)"/.exec(
    html,
  );
  if (!target) return false;
  const { places } = placeTextEdits(data, [{ id: 'link', find }], (_, s) => s);
  const place = places.get('link');
  if (!place) return false;
  const mark = `data-entity-type="${target[1]}" data-entity-id="${target[2]}"`;
  const linked = (index: number) =>
    JSON.stringify(data.blocks[index]!.data).includes(
      mark.replaceAll('"', '\\"'),
    );
  const partStarts = (index: number) => {
    const block = data.blocks[index]!;
    return (
      block.type === 'header' && (block.data as { level?: number }).level === 2
    );
  };
  for (let index = place.block; index >= 0; index--) {
    if (linked(index)) return true;
    // A heading of the second level begins its part, its own words included.
    if (partStarts(index)) break;
  }
  for (let index = place.block + 1; index < data.blocks.length; index++) {
    if (partStarts(index)) break;
    if (linked(index)) return true;
  }
  return false;
}
