import { identityKey, termKey } from '#layers/thei/shared/identity-key';
import { fingerprintOf } from './ai/actions/declined';
import { targetRef, type ActionTarget } from './ai/actions/target';

/**
 * Brings the stored identity keys (`shared/identity-key.ts`) to what the
 * engine computes now: a tag's `normalizedTitle`, a dictionary word's
 * primary key, and the fingerprint of a `term` action, with the «never
 * offer again» records that carry it.
 *
 * Keys were once lower-cased by the server's locale, which on a Turkish one
 * made «I» into «ı». Where a key differs it is rewritten; where the new key is
 * another row's already, the row is left as it is and said so — two tags or
 * two words are never merged behind the owner's back. Safe to run again: a
 * row already right is passed over.
 */
export async function refreshIdentityKeys(
  progress: (done: number, total: number) => void | Promise<void>,
  log: (message: string) => void,
  /** How the server lower-cased before: by its locale. */
  lowerAsBefore: (value: string) => string = (value) =>
    value.toLocaleLowerCase(),
): Promise<{ changed: number; skipped: number }> {
  const { rawDb } = THEI_SERVER.useDb();
  const tags = rawDb
    .prepare('SELECT tagUuid, title, normalizedTitle FROM tags')
    .all() as { tagUuid: string; title: string; normalizedTitle: string }[];
  const terms = rawDb.prepare('SELECT word, display FROM "ai-terms"').all() as {
    word: string;
    display: string;
  }[];
  const actions = rawDb
    .prepare(
      `SELECT actionUuid, targetType, targetId, payload, proposed, fingerprint
       FROM "ai-actions" WHERE kind = 'term'`,
    )
    .all() as {
    actionUuid: string;
    targetType: string | null;
    targetId: string | null;
    payload: string;
    proposed: string | null;
    fingerprint: string;
  }[];
  const total = tags.length + terms.length + actions.length;
  let done = 0;
  let changed = 0;
  let skipped = 0;
  const step = async () => {
    done += 1;
    if (done % 50 === 0 || done === total) await progress(done, total);
  };

  const tagKeys = new Set(tags.map((tag) => tag.normalizedTitle));
  for (const tag of tags) {
    const key = identityKey(tag.title.trim());
    if (key !== tag.normalizedTitle) {
      if (tagKeys.has(key)) {
        skipped += 1;
        log(
          `The tag «${tag.title}» (${tag.tagUuid}) keeps its key: another tag already has «${key}».`,
        );
      } else {
        rawDb
          .prepare('UPDATE tags SET normalizedTitle = ? WHERE tagUuid = ?')
          .run(key, tag.tagUuid);
        tagKeys.delete(tag.normalizedTitle);
        tagKeys.add(key);
        changed += 1;
      }
    }
    await step();
  }

  const words = new Set(terms.map((term) => term.word));
  for (const term of terms) {
    const key = termKey(term.display);
    if (key !== term.word) {
      if (words.has(key)) {
        skipped += 1;
        log(
          `The dictionary word «${term.display}» keeps its key: another word already has «${key}».`,
        );
      } else {
        rawDb
          .prepare('UPDATE "ai-terms" SET word = ? WHERE word = ?')
          .run(key, term.word);
        words.delete(term.word);
        words.add(key);
        changed += 1;
      }
    }
    await step();
  }

  for (const action of actions) {
    const fingerprint = termFingerprint(action, lowerAsBefore);
    if (fingerprint && fingerprint !== action.fingerprint) {
      rawDb.transaction(() => {
        rawDb
          .prepare(
            'UPDATE "ai-actions" SET fingerprint = ? WHERE actionUuid = ?',
          )
          .run(fingerprint, action.actionUuid);
        rawDb
          .prepare(
            `UPDATE "ai-memory" SET fingerprint = ? WHERE type = 'never' AND fingerprint = ?`,
          )
          .run(fingerprint, action.fingerprint);
      })();
      changed += 1;
    }
    await step();
  }
  if (!total) await progress(0, 0);
  return { changed, skipped };
}

/**
 * A `term` action's fingerprint as a proposal makes it now
 * (`ai/actions/propose.ts`), from the words the model proposed; undefined
 * when the stored one was not made from these words at all, under any rule
 * this release knows.
 */
function termFingerprint(
  action: {
    targetType: string | null;
    targetId: string | null;
    payload: string;
    proposed: string | null;
    fingerprint: string;
  },
  lowerAsBefore: (value: string) => string,
): string | undefined {
  let word: unknown;
  try {
    word = (JSON.parse(action.proposed ?? action.payload) as { word?: unknown })
      .word;
  } catch {
    return undefined;
  }
  if (typeof word !== 'string') return undefined;
  const target =
    action.targetType && action.targetId
      ? targetRef({
          kind: action.targetType,
          id: action.targetId,
        } as ActionTarget)
      : null;
  // The key as the server's locale made it, before identity keys.
  const before = lowerAsBefore(word.normalize('NFKC'))
    .replaceAll('ё', 'е')
    .replace(/\s+/g, ' ')
    .trim();
  for (const ref of target ? [target, null] : [null]) {
    const made = (key: string) => fingerprintOf(['term', ref, [key]]);
    if (
      made(before) === action.fingerprint ||
      made(termKey(word)) === action.fingerprint
    )
      return made(termKey(word));
  }
  return undefined;
}
