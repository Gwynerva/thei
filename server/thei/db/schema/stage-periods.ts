import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { STAGE_TYPES } from '../../../../shared/stage-period';

const allowedStageTypes = sql.raw(
  STAGE_TYPES.map((type) => `'${type.replaceAll("'", "''")}'`).join(', '),
);

export const stagePeriods = sqliteTable(
  'stage-periods',
  {
    stageType: text({ enum: STAGE_TYPES }).notNull(),
    stageUuid: text().notNull(),
    sortOrder: integer().notNull(),
    startDate: text().notNull(),
    endDate: text().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.stageType, t.stageUuid, t.sortOrder] }),
    check(
      'stage-periods-stage-type-check',
      sql`${t.stageType} in (${allowedStageTypes})`,
    ),
  ],
);
