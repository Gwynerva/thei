/**
 * The keys Thei stores to tell names apart. A change of what they return
 * changes stored rows, so they are pinned by a test and changed only with an
 * update task that recomputes every one of them (`0.0.7/002-identity-keys`):
 *
 * - `tags.normalizedTitle` (unique): a tag's title (`normalizeTagTitle`);
 * - a tag's synonyms, told apart among themselves (`synonymIdentity`);
 * - `ai-terms.word` (the primary key): a word of the AI's dictionary;
 * - the fingerprint of a `term` action, which a declined one is refused by.
 *
 * Comparing is another matter: `searchKey` (`shared/search/match.ts`) and
 * `normalizeTermText` (`shared/text-terms.ts`) are free to read text as they
 * please, and are never stored.
 */

/**
 * Case, compatibility forms and «ё» set aside. Lower case by Unicode's own
 * rules, never the server's locale: a Turkish one would turn «I» into «ı».
 */
export function identityKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replaceAll('ё', 'е');
}

/** A word of the dictionary: its identity key, runs of space folded. */
export function termKey(display: string): string {
  return identityKey(display).replace(/\s+/g, ' ').trim();
}
