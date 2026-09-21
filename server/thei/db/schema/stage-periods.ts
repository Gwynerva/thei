import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { STAGE_TYPES } from '../../../../shared/stage-period';
import { DATE_PRECISIONS } from '../../../../shared/date-precision';

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
    /** How sure the owner is of these dates; `exact` unless they said otherwise. */
    precision: text({ enum: DATE_PRECISIONS }).notNull().default('exact'),
    /** The owner's own words about the doubt, shown next to the date. */
    precisionNote: text().notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.stageType, t.stageUuid, t.sortOrder] }),
    check(
      'stage-periods-stage-type-check',
      sql`${t.stageType} in (${allowedStageTypes})`,
    ),
  ],
);
