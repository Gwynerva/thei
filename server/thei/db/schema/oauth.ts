import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { ApiTokenScope } from '#layers/thei/shared/api-token';

/**
 * The apps that may ask the owner for a connection over OAuth: one known by
 * the address of its own description (`cimd`, read from there and cached),
 * or one that registered itself (`dcr`, with an id Thei gave it). A client
 * is no permission: each connection is the owner's decision.
 */
export const oauthClients = sqliteTable('oauth-clients', {
  clientId: text().primaryKey(),
  kind: text().notNull().$type<'cimd' | 'dcr'>(),
  /** What it calls itself; unverified for one that registered itself. */
  name: text().notNull(),
  /** Its home page, as it gives it. */
  uri: text(),
  redirectUris: text({ mode: 'json' }).notNull().$type<string[]>(),
  createdAt: integer().notNull(),
  /** For a described one: when its description was read. */
  fetchedAt: integer(),
  /** For a described one: when that reading is to be renewed. */
  staleAt: integer(),
  lastUsedAt: integer(),
});

/**
 * A request for a connection, from the app's first redirect to the key it
 * gets: waiting for the owner's word, then holding the one-time code the
 * app exchanges. Kept a little past its expiry, so a code used twice is
 * recognised and the connection it made is taken back.
 */
export const oauthAuthorizations = sqliteTable(
  'oauth-authorizations',
  {
    requestId: text().primaryKey(),
    clientId: text().notNull(),
    redirectUri: text().notNull(),
    codeChallenge: text().notNull(),
    state: text(),
    resource: text().notNull(),
    requestedScopes: text({ mode: 'json' }).notNull().$type<ApiTokenScope[]>(),
    createdAt: integer().notNull(),
    expiresAt: integer().notNull(),
    /** Set once the owner allowed it: the hash of the one-time code. */
    codeHash: text().unique(),
    grantedScopes: text({ mode: 'json' }).$type<ApiTokenScope[]>(),
    label: text(),
    /** The connection the code was exchanged for. */
    tokenUuid: text(),
    usedAt: integer(),
  },
  (t) => [index('oauth-authorizations-expires-idx').on(t.expiresAt)],
);
