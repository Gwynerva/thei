import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';
import { PERIOD_OWNER_TYPES } from '../../../../shared/period';
import { DATE_PRECISIONS } from '../../../../shared/date-precision';

const allowedOwnerTypes = sql.raw(
  PERIOD_OWNER_TYPES.map((type) => `'${type.replaceAll("'", "''")}'`).join(
    ', ',
  ),
);

/** The dated stretches of an event or a project section, in their order. */
export const periods = sqliteTable(
  'periods',
  {
    ownerType: text({ enum: PERIOD_OWNER_TYPES }).notNull(),
    ownerId: text().notNull(),
    sortOrder: integer().notNull(),
    startDate: text().notNull(),
    endDate: text().notNull(),
    /** How sure the owner is of these dates; `exact` unless they said otherwise. */
    precision: text({ enum: DATE_PRECISIONS }).notNull().default('exact'),
    /** The owner's own words about the doubt, shown next to the date. */
    precisionNote: text().notNull().default(''),
    /** What this stretch was, in the owner's words; empty when unnamed. */
    label: text().notNull().default(''),
  },
  (t) => [
    primaryKey({ columns: [t.ownerType, t.ownerId, t.sortOrder] }),
    check(
      'periods-owner-type-check',
      sql`${t.ownerType} in (${allowedOwnerTypes})`,
    ),
  ],
);
