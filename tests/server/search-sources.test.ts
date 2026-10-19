import { describe, expect, it } from 'vitest';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { schema } from '../../server/thei/db/schema/index';
import { CONTENT_BLOCK_TYPES, CONTENT_SLOTS } from '../../shared/content';
import { contentInlineLinkSanitizeConfig } from '../../shared/content-link';
import {
  SEARCH_BLOCK_TYPES,
  SEARCH_COLUMNS,
  SEARCH_CONTENT_SLOTS,
  SEARCH_INLINE_MARKUP,
  SEARCH_SKIPPED_TABLES,
} from '../../server/thei/search/sources';

/**
 * Every text the owner writes is searched or deliberately not
 * (`server/thei/search/sources.ts`): a new column, slot, block type or
 * attribute of the inline markup that is neither fails here.
 */
const tables = Object.values(schema)
  .filter((table): table is SQLiteTable => table instanceof SQLiteTable)
  .map((table) => getTableConfig(table));

describe('the sources of the search', () => {
  it('name every text column, each searched or left out with a reason', () => {
    const columns = tables
      .filter((table) => !(table.name in SEARCH_SKIPPED_TABLES))
      .flatMap((table) =>
        table.columns
          .filter((column) => column.getSQLType() === 'text')
          .map((column) => `${table.name}.${column.name}`),
      );
    expect(columns.filter((column) => !(column in SEARCH_COLUMNS))).toEqual([]);
    expect(
      Object.keys(SEARCH_COLUMNS).filter((column) => !columns.includes(column)),
    ).toEqual([]);
  });

  it('leave out only tables that exist', () => {
    const names = tables.map((table) => table.name);
    expect(
      Object.keys(SEARCH_SKIPPED_TABLES).filter(
        (name) => !names.includes(name),
      ),
    ).toEqual([]);
  });

  it('name every slot of a text and every kind of block', () => {
    expect(Object.keys(SEARCH_CONTENT_SLOTS).sort()).toEqual(
      [...CONTENT_SLOTS].sort(),
    );
    expect(Object.keys(SEARCH_BLOCK_TYPES).sort()).toEqual(
      [...CONTENT_BLOCK_TYPES].sort(),
    );
  });

  it('name every attribute the inline markup keeps, and the hint', () => {
    const kept = [
      ...Object.keys(contentInlineLinkSanitizeConfig()).filter(
        (name) => name !== 'target' && name !== 'rel',
      ),
      'data-content-hint',
    ];
    expect(kept.filter((name) => !(name in SEARCH_INLINE_MARKUP))).toEqual([]);
  });

  it('give every source a place or a reason', () => {
    for (const source of [
      ...Object.values(SEARCH_COLUMNS),
      ...Object.values(SEARCH_CONTENT_SLOTS),
      ...Object.values(SEARCH_BLOCK_TYPES),
      ...Object.values(SEARCH_INLINE_MARKUP),
    ])
      expect('found' in source ? source.found : source.skipped).toMatch(
        /\p{L}{2}/u,
      );
  });
});
