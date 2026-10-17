import { defineMigration, type MigrationContext } from './types';

/** Adds a column, as the release writes it, to a table that lacks it. */
function addColumn(
  rawDb: MigrationContext['rawDb'],
  table: string,
  definition: string,
) {
  const name = /^`([^`]+)`/.exec(definition)![1]!;
  const columns = rawDb.prepare(`PRAGMA table_info('${table}')`).all() as {
    name: string;
  }[];
  if (!columns.some((column) => column.name === name))
    rawDb.prepare(`ALTER TABLE \`${table}\` ADD ${definition}`).run();
}

/**
 * AI and the apps that connect to it: the access keys apps connect with,
 * by hand or by signing in (OAuth); the sessions where a model talks about
 * the archive, their messages and the actions proposed in them; what the AI
 * remembers, the owner's dictionary and the models' digests of entities;
 * the session templates and what the built-in checks have looked at; and
 * what the site's own model spends a day. All of it starts empty and stays
 * unused while AI is off.
 *
 * Tags and the profile learn when they last changed, as every other entity
 * does, and a version of a text kept from before an AI edit learns which
 * action holds it.
 */
export default defineMigration({
  id: '0.0.6/001-ai',
  version: '0.0.6',
  title: {
    en: 'Add AI sessions, templates and app connections',
    ru: 'Сессии, шаблоны и подключения ИИ',
  },
  description: {
    en: 'Adds the tables of AI sessions and their actions, memory, templates and checks, and the access keys and sign-ins of AI apps.',
    ru: 'Добавляет таблицы сессий ИИ и их действий, памяти, шаблонов и проверок, а также ключей доступа и входа ИИ-приложений.',
  },
  up({ rawDb }) {
    addColumn(rawDb, 'tags', '`updatedAt` integer DEFAULT 0 NOT NULL');
    addColumn(rawDb, 'profiles', '`updatedAt` integer DEFAULT 0 NOT NULL');
    addColumn(rawDb, 'content-history', '`heldBy` text');
    for (const statement of [
      "CREATE TABLE IF NOT EXISTS `api-tokens` (`tokenUuid` text PRIMARY KEY NOT NULL, `label` text NOT NULL, `tokenHash` text NOT NULL, `scopes` text NOT NULL, `createdAt` integer NOT NULL, `lastUsedAt` integer, `lastClient` text, `kind` text DEFAULT 'token' NOT NULL, `clientId` text, `resource` text, `accessExpiresAt` integer, `refreshHash` text, `refreshExpiresAt` integer, `previousRefreshHash` text, `refreshedAt` integer)",
      'CREATE UNIQUE INDEX IF NOT EXISTS `api-tokens_tokenHash_unique` ON `api-tokens` (`tokenHash`)',
      'CREATE UNIQUE INDEX IF NOT EXISTS `api-tokens-refresh-idx` ON `api-tokens` (`refreshHash`)',
      'CREATE INDEX IF NOT EXISTS `api-tokens-previous-refresh-idx` ON `api-tokens` (`previousRefreshHash`)',
      'CREATE TABLE IF NOT EXISTS `oauth-clients` (`clientId` text PRIMARY KEY NOT NULL, `kind` text NOT NULL, `name` text NOT NULL, `uri` text, `redirectUris` text NOT NULL, `createdAt` integer NOT NULL, `fetchedAt` integer, `staleAt` integer, `lastUsedAt` integer)',
      'CREATE TABLE IF NOT EXISTS `oauth-authorizations` (`requestId` text PRIMARY KEY NOT NULL, `clientId` text NOT NULL, `redirectUri` text NOT NULL, `codeChallenge` text NOT NULL, `state` text, `resource` text NOT NULL, `requestedScopes` text NOT NULL, `createdAt` integer NOT NULL, `expiresAt` integer NOT NULL, `codeHash` text, `grantedScopes` text, `label` text, `tokenUuid` text, `usedAt` integer)',
      'CREATE UNIQUE INDEX IF NOT EXISTS `oauth-authorizations_codeHash_unique` ON `oauth-authorizations` (`codeHash`)',
      'CREATE INDEX IF NOT EXISTS `oauth-authorizations-expires-idx` ON `oauth-authorizations` (`expiresAt`)',
      'CREATE TABLE IF NOT EXISTS `ai-usage` (`day` text PRIMARY KEY NOT NULL, `inputTokens` integer DEFAULT 0 NOT NULL, `outputTokens` integer DEFAULT 0 NOT NULL, `cacheReadTokens` integer DEFAULT 0 NOT NULL, `cacheWriteTokens` integer DEFAULT 0 NOT NULL, `calls` integer DEFAULT 0 NOT NULL)',
      "CREATE TABLE IF NOT EXISTS `ai-sessions` (`sessionUuid` text PRIMARY KEY NOT NULL, `title` text DEFAULT '' NOT NULL, `origin` text NOT NULL, `tokenUuid` text, `client` text, `templateId` text, `model` text, `state` text DEFAULT 'idle' NOT NULL, `pinned` integer DEFAULT false NOT NULL, `waiting` integer DEFAULT 0 NOT NULL, `applied` integer DEFAULT 0 NOT NULL, `rejected` integer DEFAULT 0 NOT NULL, `tokens` integer DEFAULT 0 NOT NULL, `error` text, `createdAt` integer NOT NULL, `lastActiveAt` integer NOT NULL, `closedAt` integer, `archivedAt` integer)",
      'CREATE INDEX IF NOT EXISTS `ai-sessions-active-idx` ON `ai-sessions` (`archivedAt`,`lastActiveAt`)',
      'CREATE INDEX IF NOT EXISTS `ai-sessions-app-idx` ON `ai-sessions` (`tokenUuid`,`client`,`lastActiveAt`)',
      'CREATE INDEX IF NOT EXISTS `ai-sessions-template-idx` ON `ai-sessions` (`templateId`,`createdAt`)',
      'CREATE INDEX IF NOT EXISTS `ai-sessions-waiting-idx` ON `ai-sessions` (`waiting`)',
      "CREATE TABLE IF NOT EXISTS `ai-messages` (`messageUuid` text PRIMARY KEY NOT NULL, `sessionUuid` text NOT NULL, `seq` integer NOT NULL, `role` text NOT NULL, `text` text DEFAULT '' NOT NULL, `parts` text DEFAULT '[]' NOT NULL, `transcript` text DEFAULT '[]' NOT NULL, `tokens` integer DEFAULT 0 NOT NULL, `createdAt` integer NOT NULL)",
      'CREATE UNIQUE INDEX IF NOT EXISTS `ai-messages-seq-idx` ON `ai-messages` (`sessionUuid`,`seq`)',
      "CREATE TABLE IF NOT EXISTS `ai-actions` (`actionUuid` text PRIMARY KEY NOT NULL, `sessionUuid` text NOT NULL, `messageUuid` text, `bundleUuid` text, `bundleOrder` integer DEFAULT 0 NOT NULL, `atomic` integer DEFAULT false NOT NULL, `kind` text NOT NULL, `targetType` text, `targetId` text, `payload` text NOT NULL, `parts` text, `base` text, `certainty` text NOT NULL, `reason` text DEFAULT '' NOT NULL, `state` text NOT NULL, `supersedes` text, `fingerprint` text NOT NULL, `undo` text, `assetUuids` text DEFAULT '[]' NOT NULL, `appliedBy` text, `createdAt` integer NOT NULL, `decidedAt` integer, `error` text)",
      'CREATE INDEX IF NOT EXISTS `ai-actions-session-idx` ON `ai-actions` (`sessionUuid`,`createdAt`)',
      'CREATE INDEX IF NOT EXISTS `ai-actions-target-idx` ON `ai-actions` (`targetType`,`targetId`,`state`)',
      'CREATE INDEX IF NOT EXISTS `ai-actions-state-idx` ON `ai-actions` (`state`)',
      'CREATE INDEX IF NOT EXISTS `ai-actions-fingerprint-idx` ON `ai-actions` (`fingerprint`)',
      'CREATE TABLE IF NOT EXISTS `ai-session-entities` (`sessionUuid` text NOT NULL, `entityType` text NOT NULL, `entityId` text NOT NULL, `role` text NOT NULL, `at` integer NOT NULL, PRIMARY KEY(`sessionUuid`, `entityType`, `entityId`))',
      'CREATE INDEX IF NOT EXISTS `ai-session-entities-entity-idx` ON `ai-session-entities` (`entityType`,`entityId`,`at`)',
      "CREATE TABLE IF NOT EXISTS `ai-memory` (`memoryUuid` text PRIMARY KEY NOT NULL, `anchor` text NOT NULL, `anchorType` text DEFAULT '' NOT NULL, `anchorId` text DEFAULT '' NOT NULL, `otherType` text, `otherId` text, `type` text NOT NULL, `text` text NOT NULL, `fingerprint` text, `sessionUuid` text, `createdAt` integer NOT NULL, `updatedAt` integer NOT NULL)",
      'CREATE INDEX IF NOT EXISTS `ai-memory-anchor-idx` ON `ai-memory` (`anchor`,`anchorType`,`anchorId`)',
      'CREATE INDEX IF NOT EXISTS `ai-memory-other-idx` ON `ai-memory` (`otherType`,`otherId`)',
      'CREATE INDEX IF NOT EXISTS `ai-memory-fingerprint-idx` ON `ai-memory` (`fingerprint`)',
      "CREATE TABLE IF NOT EXISTS `ai-terms` (`word` text PRIMARY KEY NOT NULL, `display` text NOT NULL, `note` text DEFAULT '' NOT NULL, `forms` text DEFAULT '[]' NOT NULL, `keep` integer DEFAULT true NOT NULL, `createdAt` integer NOT NULL, `updatedAt` integer NOT NULL)",
      "CREATE TABLE IF NOT EXISTS `ai-digests` (`entityType` text NOT NULL, `entityId` text NOT NULL, `text` text NOT NULL, `fingerprint` text NOT NULL, `model` text DEFAULT '' NOT NULL, `at` integer NOT NULL, PRIMARY KEY(`entityType`, `entityId`))",
      'CREATE TABLE IF NOT EXISTS `ai-templates` (`templateId` text PRIMARY KEY NOT NULL, `builtin` text, `title` text, `instruction` text, `lastSessionUuid` text, `createdAt` integer NOT NULL, `updatedAt` integer NOT NULL)',
      "CREATE TABLE IF NOT EXISTS `ai-template-coverage` (`templateId` text NOT NULL, `subject` text NOT NULL, `entityType` text, `entityId` text, `fingerprint` text NOT NULL, `parts` text DEFAULT '[]' NOT NULL, `at` integer NOT NULL, PRIMARY KEY(`templateId`, `subject`))",
      'CREATE INDEX IF NOT EXISTS `ai-template-coverage-entity-idx` ON `ai-template-coverage` (`entityType`,`entityId`)',
      "CREATE TABLE IF NOT EXISTS `ai-template-batches` (`sessionUuid` text NOT NULL, `templateId` text NOT NULL, `subject` text NOT NULL, `entityType` text, `entityId` text, `fingerprint` text NOT NULL, `parts` text DEFAULT '[]' NOT NULL, PRIMARY KEY(`sessionUuid`, `subject`))",
      'CREATE INDEX IF NOT EXISTS `ai-template-batches-template-idx` ON `ai-template-batches` (`templateId`)',
      'CREATE INDEX IF NOT EXISTS `ai-template-batches-entity-idx` ON `ai-template-batches` (`entityType`,`entityId`)',
    ])
      rawDb.prepare(statement).run();
  },
});
