import { and, eq, sql } from 'drizzle-orm';
import type { AiEntityOffer } from '#layers/thei/shared/ai-entity';
import { assetFamilyOf } from '../assets/descriptions';
import type { ActionRow } from './actions/types';
import { waitingOffers } from './entity-panel';

/**
 * What a file's description field shows of the AI: the descriptions
 * proposed for the file's family, at the field's label. A proposal made for
 * any variant of the file waits at every one, since they share one.
 */
export async function fileOffers(assetUuid: string): Promise<AiEntityOffer[]> {
  const family = assetFamilyOf(assetUuid);
  if (!family) return [];
  const { db, schema } = THEI_SERVER.useDb();
  const rows = db
    .select()
    .from(schema.aiActions)
    .where(
      and(
        eq(schema.aiActions.kind, 'describe'),
        eq(schema.aiActions.state, 'pending'),
        sql`json_extract(${schema.aiActions.payload}, '$.family') = ${family.familyUuid}`,
      ),
    )
    .all() as ActionRow[];
  return waitingOffers(rows, () => 'field:description');
}
