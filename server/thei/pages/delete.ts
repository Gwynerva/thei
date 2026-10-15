import { and, eq } from 'drizzle-orm';
import { deleteContentForOwner } from '../content/repository';
import { deleteShareLinks } from '../access-links/share-links';
import type { EntityEditOptions } from '../entity-edit';
import { deleteUsagesReleasing } from '../assets/repository/usages/release';
import { forgetAiAnchors } from '../ai/memory/forget';

export function deletePage(
  pageUuid: string,
  options: Pick<EntityEditOptions, 'onWrite' | 'beforeWrite'> = {},
) {
  const { db, schema } = THEI_SERVER.useDb();
  db.transaction((tx) => {
    options.beforeWrite?.(tx, schema);
    tx.delete(schema.profilePinnedPages)
      .where(eq(schema.profilePinnedPages.pageUuid, pageUuid))
      .run();
    deleteContentForOwner(tx, schema, 'page', pageUuid);
    forgetAiAnchors(tx, schema, 'page', [pageUuid]);
    deleteShareLinks(tx, schema, 'page', pageUuid);
    deleteUsagesReleasing(
      tx,
      schema,
      and(
        eq(schema.assetUsages.containerType, 'page'),
        eq(schema.assetUsages.containerId, pageUuid),
      ),
    );
    tx.delete(schema.pages).where(eq(schema.pages.pageUuid, pageUuid)).run();
    options.onWrite?.(tx, schema);
  });
}
