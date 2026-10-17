import { and, asc, eq } from 'drizzle-orm';
import { normalizeHeadingText } from '#layers/thei/shared/terminal-punctuation';
import { publishSession } from './bus';
import { findSession, updateSession, type SessionRow } from './store';

/**
 * What a session of the owner's is called. Until the model names it, after
 * the first message and its answer, it goes by the start of the owner's
 * first words; the owner may rename it at any time, and a name the owner
 * gave is never changed by the model.
 */

/** How long a name the model gives may be. */
export const SESSION_NAME_MAX = 60;
/** How much of the owner's first words a session goes by until it is named. */
const FIRST_WORDS_MAX = 40;

/** A session's name as stored: one line, ended as a heading is. */
export function cleanSessionTitle(value: string, max = 200): string {
  return normalizeHeadingText(value.replace(/\s+/g, ' ').trim().slice(0, max));
}

/** The start of the owner's first words, as a session goes by until named. */
export function titleFromWords(text: string): string {
  const line = text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#>\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (line.length <= FIRST_WORDS_MAX) return cleanSessionTitle(line);
  const cut = line.slice(0, FIRST_WORDS_MAX);
  const space = cut.lastIndexOf(' ');
  return `${(space > FIRST_WORDS_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Whether a session of the owner's still goes by its first words: neither
 * the model nor the owner has named it.
 */
export function sessionUnnamed(session: SessionRow): boolean {
  if (session.origin !== 'owner') return false;
  const { db, schema } = THEI_SERVER.useDb();
  const first = db
    .select({ text: schema.aiMessages.text })
    .from(schema.aiMessages)
    .where(
      and(
        eq(schema.aiMessages.sessionUuid, session.sessionUuid),
        eq(schema.aiMessages.role, 'owner'),
      ),
    )
    .orderBy(asc(schema.aiMessages.seq))
    .limit(1)
    .get();
  return Boolean(first) && session.title === titleFromWords(first!.text);
}

/**
 * The model names a session still going by its first words; says what came
 * of it. `live` says whether its turn may still write.
 */
export function nameSession(
  sessionUuid: string,
  name: unknown,
  live: () => boolean = () => true,
): string {
  if (!live()) return 'The turn was stopped; it was not named.';
  const session = findSession(sessionUuid);
  if (!session || !sessionUnnamed(session)) return 'It has its name already.';
  const title =
    typeof name === 'string' ? cleanSessionTitle(name, SESSION_NAME_MAX) : '';
  if (!title) return 'A name needs its words.';
  updateSession(sessionUuid, { title });
  publishSession(sessionUuid, { type: 'session' });
  return 'Named.';
}
