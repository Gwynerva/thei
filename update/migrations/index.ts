import type { TheiMigration } from './types';
import baseline from './0.0.1-baseline';

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
export const migrationRegistry: TheiMigration[] = [baseline];

export { baselineSql } from './0.0.1-baseline';
