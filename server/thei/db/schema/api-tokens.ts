import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import type { ApiTokenScope } from '#layers/thei/shared/api-token';

/**
 * Access keys that let an AI app work with the site over MCP: one the owner
 * made and copied (`token`), or a connection an app made by signing in
 * (`oauth`), whose key lasts an hour and is renewed by a refresh key.
 *
 * Only the hash of a key is kept, so a copy of the database never yields a
 * working one. Revoking is deleting the row: a leaked key stops working at
 * once. A connection keeps its id through every renewal, so its rights and
 * its sessions stay its own.
 */
export const apiTokens = sqliteTable(
  'api-tokens',
  {
    tokenUuid: text().primaryKey(),
    /** What the key is for, in the owner's words. */
    label: text().notNull(),
    /** The key in use: for a connection, its current access key. */
    tokenHash: text().notNull().unique(),
    /** The scopes it holds, in canonical order. */
    scopes: text({ mode: 'json' }).notNull().$type<ApiTokenScope[]>(),
    createdAt: integer().notNull(),
    /** Written at most once a minute, so a busy client costs no writes. */
    lastUsedAt: integer(),
    /** The client last seen with it, as it introduced itself. */
    lastClient: text(),
    kind: text().notNull().$type<'token' | 'oauth'>().default('token'),
    /** For a connection: the app that signed in, by its OAuth client id. */
    clientId: text(),
    /** For a connection: the address the key was issued for. */
    resource: text(),
    accessExpiresAt: integer(),
    refreshHash: text(),
    refreshExpiresAt: integer(),
    /** The refresh key renewed last, for a second renewal racing the first. */
    previousRefreshHash: text(),
    refreshedAt: integer(),
  },
  (t) => [
    uniqueIndex('api-tokens-refresh-idx').on(t.refreshHash),
    index('api-tokens-previous-refresh-idx').on(t.previousRefreshHash),
  ],
);
