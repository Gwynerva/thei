import { and, gte, lt, sql } from 'drizzle-orm';

/**
 * What the site's model spends, a row a day, and what is left of the limit
 * the owner set. A token read from the model's cache counts for a tenth —
 * about what it costs — so a long look-over that rereads the same texts
 * is not counted ten times over.
 */

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** How long a day's row is kept: a year and a little. */
const USAGE_LIFETIME_DAYS = 400;

/** A day on the server's clock, as the rows are keyed. */
export function localDay(at: number | Date = Date.now()): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Tokens as the limits count them. */
export function countedTokens(usage: ModelUsage): number {
  return (
    usage.inputTokens +
    usage.outputTokens +
    usage.cacheWriteTokens +
    Math.ceil(usage.cacheReadTokens / 10)
  );
}

/** Adds one call of the model to its day. */
export function recordUsage(usage: ModelUsage, at = Date.now()) {
  const { db, schema } = THEI_SERVER.useDb();
  const table = schema.aiUsage;
  db.insert(table)
    .values({ day: localDay(at), ...usage, calls: 1 })
    .onConflictDoUpdate({
      target: table.day,
      set: {
        inputTokens: sql`${table.inputTokens} + ${usage.inputTokens}`,
        outputTokens: sql`${table.outputTokens} + ${usage.outputTokens}`,
        cacheReadTokens: sql`${table.cacheReadTokens} + ${usage.cacheReadTokens}`,
        cacheWriteTokens: sql`${table.cacheWriteTokens} + ${usage.cacheWriteTokens}`,
        calls: sql`${table.calls} + 1`,
      },
    })
    .run();
}

function spentSince(firstDay: string): number {
  const { db, schema } = THEI_SERVER.useDb();
  return (
    db
      .select()
      .from(schema.aiUsage)
      .where(gte(schema.aiUsage.day, firstDay))
      .all() as ModelUsage[]
  ).reduce((sum, row) => sum + countedTokens(row), 0);
}

/** Tokens spent this month. */
export function spentTokens(at = Date.now()): { month: number } {
  return { month: spentSince(`${localDay(at).slice(0, 8)}01`) };
}

/** What is left of the month's limit, or nothing. */
export function tokensLeft(at = Date.now()): number {
  const { monthlyTokens } = THEI_SERVER.config.mcp;
  return Math.max(0, monthlyTokens - spentTokens(at).month);
}

/** Forgets days older than a year. */
export function sweepUsage(at = Date.now()) {
  const { db, schema } = THEI_SERVER.useDb();
  const oldest = localDay(at - USAGE_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
  db.delete(schema.aiUsage)
    .where(and(lt(schema.aiUsage.day, oldest)))
    .run();
}
