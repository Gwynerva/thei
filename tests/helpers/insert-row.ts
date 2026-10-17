import type { Database } from 'better-sqlite3';

/**
 * Inserts one row as written, column by column: an object or a list goes in
 * as its JSON, the way the schema's JSON columns keep it.
 */
export function insertRow(
  rawDb: Database,
  table: string,
  row: Record<string, unknown>,
) {
  const columns = Object.keys(row);
  rawDb
    .prepare(
      `INSERT INTO \`${table}\` (${columns.map((column) => `\`${column}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    )
    .run(
      ...columns.map((column) => {
        const value = row[column];
        return value !== null &&
          typeof value === 'object' &&
          !(value instanceof Uint8Array)
          ? JSON.stringify(value)
          : value;
      }),
    );
}
