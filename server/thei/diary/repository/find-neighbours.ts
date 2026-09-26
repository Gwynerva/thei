import { and, asc, desc, eq, gt, lt, type SQL } from 'drizzle-orm';
import { ProjectEventAccessLevel } from '#layers/thei/shared/access-level';

/**
 * The entries written just before and just after a day, skipping days
 * without one.
 *
 * A visitor steps only between public entries: an entry shared by link or
 * kept private is not listed anywhere, so it is not a neighbour either.
 */
export async function findDiaryEntryNeighbours(
  date: string,
  includeHidden: boolean,
) {
  const { db, schema } = THEI_SERVER.useDb();
  const entries = schema.diaryEntries;
  const visible: SQL | undefined = includeHidden
    ? undefined
    : eq(entries.access, ProjectEventAccessLevel.Public);
  const [previous, next] = await Promise.all([
    db.query.diaryEntries.findFirst({
      where: and(lt(entries.date, date), visible),
      orderBy: desc(entries.date),
    }),
    db.query.diaryEntries.findFirst({
      where: and(gt(entries.date, date), visible),
      orderBy: asc(entries.date),
    }),
  ]);
  return { previous, next };
}
