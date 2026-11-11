import { asc, count, eq, gt } from 'drizzle-orm';
import type { ContentOutputData } from '#layers/thei/shared/content';
import { giveBlockIds } from '#layers/thei/shared/content-block-ids';
import { recordContentAnchors } from '../content-links/anchor-ledger';

const PAGE_SIZE = 200;

/**
 * Gives an id to every stored block that has none, or repeats one, as a save
 * gives one now (`shared/content-block-ids.ts`): texts written as editing
 * Markdown were stored without, and a find of the search could not name its
 * place in them.
 *
 * Only the texts that change are written, and `updatedAt` is left alone: not
 * a word of them moves, and a block is written as a save writes it, so the
 * next save of the same text changes nothing. Their headings are remembered
 * by their blocks, which they could not be before. Running it again writes
 * nothing.
 */
export async function giveStoredBlockIds(
  onProgress: (done: number, total: number) => void | Promise<void>,
  log: (message: string) => void,
) {
  const { db, schema } = THEI_SERVER.useDb();
  const total =
    db.select({ value: count() }).from(schema.content).get()?.value ?? 0;
  const now = Date.now();
  let done = 0;
  let changed = 0;
  let cursor = '';
  while (true) {
    const rows = db
      .select({
        contentUuid: schema.content.contentUuid,
        ownerType: schema.content.ownerType,
        ownerId: schema.content.ownerId,
        slot: schema.content.slot,
        data: schema.content.data,
      })
      .from(schema.content)
      .where(gt(schema.content.contentUuid, cursor))
      .orderBy(asc(schema.content.contentUuid))
      .limit(PAGE_SIZE)
      .all();
    if (!rows.length) return { changed, total };
    cursor = rows.at(-1)!.contentUuid;
    db.transaction((tx) => {
      for (const row of rows) {
        const stored = row.data as ContentOutputData | null;
        if (!Array.isArray(stored?.blocks)) {
          log(
            `The text ${row.contentUuid} could not be read and was left as it was.`,
          );
          continue;
        }
        // A row that cannot be read is skipped and told, never thrown: an
        // exception here would keep the site closed. What was written of it
        // goes back with its own transaction.
        try {
          const data = giveBlockIds(stored);
          if (data === stored) continue;
          tx.transaction((rowTx) => {
            rowTx
              .update(schema.content)
              .set({ data })
              .where(eq(schema.content.contentUuid, row.contentUuid))
              .run();
            recordContentAnchors(
              rowTx,
              schema,
              {
                ownerType: row.ownerType,
                ownerId: row.ownerId,
                slot: row.slot,
              },
              [data],
              now,
            );
          });
          changed++;
        } catch {
          log(
            `The text ${row.contentUuid} could not be read and was left as it was.`,
          );
        }
      }
    });
    done += rows.length;
    await onProgress(done, total);
  }
}
