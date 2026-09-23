import type { TheiMigration } from './types';
import baseline from './0.0.1-baseline';
import accessLinks from './0.0.2-access-links';
import datePrecision from './0.0.2-date-precision';
import entityReminders from './0.0.2-entity-reminders';
import statusesOwner from './0.0.2-statuses-owner';
import tagAccent from './0.0.2-tag-accent';
import projectRelations from './0.0.2-project-relations';
import diaryEntries from './0.0.2-diary-entries';

/**
 * Every migration Thei has ever shipped, oldest first.
 *
 * Imports are static and the order is explicit on purpose: the list has to
 * survive bundling into `.output`, and the order is the upgrade path.
 *
 * To add one: create `update/migrations/<version>-<slug>.ts` with
 * `defineMigration({ id: '<version>/<order>-<slug>', ... })` and append it here.
 * Never reorder, never edit, and never remove an entry that has shipped.
 */
export const migrationRegistry: TheiMigration[] = [
  baseline,
  accessLinks,
  datePrecision,
  entityReminders,
  statusesOwner,
  tagAccent,
  projectRelations,
  diaryEntries,
];

export { baselineSql } from './0.0.1-baseline';
