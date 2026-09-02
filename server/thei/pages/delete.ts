import { and, eq } from 'drizzle-orm';
import { deleteContentForOwner } from '../content/repository';

export function deletePage(pageUuid: string) {
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    deleteContentForOwner(tx, schema, 'page', pageUuid);
    tx.delete(schema.assetUsages)
      .where(
        and(
          eq(schema.assetUsages.containerType, 'page'),
          eq(schema.assetUsages.containerId, pageUuid),
        ),
      )
      .run();
    tx.delete(schema.pages).where(eq(schema.pages.pageUuid, pageUuid)).run();
  });
}
