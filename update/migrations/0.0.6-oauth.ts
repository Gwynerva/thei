import { defineMigration } from './types';

/**
 * Connecting an AI app by signing in (OAuth), beside the access keys the
 * owner copies by hand.
 *
 * A connection is an access key like any other — same rights, same record of
 * changes — whose key lasts an hour and is renewed: the access keys table
 * learns which kind a row is, the app it belongs to, the address it was
 * issued for and its renewal. The apps that may ask, and the requests waiting
 * for the owner's word, get tables of their own. Existing keys stay as they
 * are, of the first kind.
 */
export default defineMigration({
  id: '0.0.6/007-oauth',
  version: '0.0.6',
  title: {
    en: 'Let AI apps connect by signing in',
    ru: 'Подключение ИИ-приложений входом',
  },
  description: {
    en: 'Adds connections made by signing in to the access keys, and tables for the apps that ask and their requests.',
    ru: 'Добавляет к ключам доступа подключения, сделанные входом, и таблицы для приложений и их запросов.',
  },
  up({ rawDb }) {
    for (const [name, definition] of [
      ['kind', "text DEFAULT 'token' NOT NULL"],
      ['clientId', 'text'],
      ['resource', 'text'],
      ['accessExpiresAt', 'integer'],
      ['refreshHash', 'text'],
      ['refreshExpiresAt', 'integer'],
      ['previousRefreshHash', 'text'],
      ['refreshedAt', 'integer'],
    ] as const)
      rawDb
        .prepare(`ALTER TABLE \`api-tokens\` ADD \`${name}\` ${definition}`)
        .run();
    for (const statement of [
      'CREATE UNIQUE INDEX IF NOT EXISTS `api-tokens-refresh-idx` ON `api-tokens` (`refreshHash`)',
      'CREATE INDEX IF NOT EXISTS `api-tokens-previous-refresh-idx` ON `api-tokens` (`previousRefreshHash`)',
      'CREATE TABLE IF NOT EXISTS `oauth-clients` (' +
        '`clientId` text PRIMARY KEY NOT NULL, ' +
        '`kind` text NOT NULL, ' +
        '`name` text NOT NULL, ' +
        '`uri` text, ' +
        '`redirectUris` text NOT NULL, ' +
        '`createdAt` integer NOT NULL, ' +
        '`fetchedAt` integer, ' +
        '`staleAt` integer, ' +
        '`lastUsedAt` integer' +
        ')',
      'CREATE TABLE IF NOT EXISTS `oauth-authorizations` (' +
        '`requestId` text PRIMARY KEY NOT NULL, ' +
        '`clientId` text NOT NULL, ' +
        '`redirectUri` text NOT NULL, ' +
        '`codeChallenge` text NOT NULL, ' +
        '`state` text, ' +
        '`resource` text NOT NULL, ' +
        '`requestedScopes` text NOT NULL, ' +
        '`createdAt` integer NOT NULL, ' +
        '`expiresAt` integer NOT NULL, ' +
        '`codeHash` text, ' +
        '`grantedScopes` text, ' +
        '`label` text, ' +
        '`tokenUuid` text, ' +
        '`usedAt` integer' +
        ')',
      'CREATE UNIQUE INDEX IF NOT EXISTS `oauth-authorizations_codeHash_unique` ON `oauth-authorizations` (`codeHash`)',
      'CREATE INDEX IF NOT EXISTS `oauth-authorizations-expires-idx` ON `oauth-authorizations` (`expiresAt`)',
    ])
      rawDb.prepare(statement).run();
  },
});
