import { defineMigration } from './types';

/**
 * AI sessions: conversations about the archive and the actions proposed in
 * them, what the AI remembers and where, the model's own digests of
 * entities, session templates and what each last read, and what the site's
 * model spends a day. A version of a text
 * kept from before an AI edit learns which action holds it.
 *
 * The change counters of tags and the profile come with them: what changed
 * since a template last ran is told by them, as by every other entity's.
 */
export default defineMigration({
  id: '0.0.6/009-ai',
  version: '0.0.6',
  title: {
    en: 'Add AI sessions, memory and templates',
    ru: 'Сессии, память и шаблоны ИИ',
  },
  description: {
    en: 'Adds tables for AI sessions and their actions, what the AI remembers, digests of entities and session templates.',
    ru: 'Добавляет таблицы для сессий ИИ и их действий, памяти ИИ, конспектов сущностей и шаблонов сессий.',
  },
  up({ rawDb }) {
    for (const statement of [
      'ALTER TABLE `tags` ADD `updatedAt` integer DEFAULT 0 NOT NULL',
      'ALTER TABLE `profiles` ADD `updatedAt` integer DEFAULT 0 NOT NULL',
      'ALTER TABLE `content-history` ADD `heldBy` text',
      'CREATE TABLE IF NOT EXISTS `ai-usage` (`day` text PRIMARY KEY NOT NULL, `inputTokens` integer DEFAULT 0 NOT NULL, `outputTokens` integer DEFAULT 0 NOT NULL, `cacheReadTokens` integer DEFAULT 0 NOT NULL, `cacheWriteTokens` integer DEFAULT 0 NOT NULL, `calls` integer DEFAULT 0 NOT NULL)',
      "CREATE TABLE IF NOT EXISTS `ai-sessions` (`sessionUuid` text PRIMARY KEY NOT NULL, `title` text DEFAULT '' NOT NULL, `origin` text NOT NULL, `tokenUuid` text, `client` text, `templateId` text, `model` text, `state` text DEFAULT 'idle' NOT NULL, `pinned` integer DEFAULT false NOT NULL, `waiting` integer DEFAULT 0 NOT NULL, `applied` integer DEFAULT 0 NOT NULL, `rejected` integer DEFAULT 0 NOT NULL, `summary` text DEFAULT '' NOT NULL, `tokens` integer DEFAULT 0 NOT NULL, `error` text, `createdAt` integer NOT NULL, `lastActiveAt` integer NOT NULL, `closedAt` integer, `archivedAt` integer, `purgedAt` integer)",
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
      "CREATE TABLE IF NOT EXISTS `ai-templates` (`templateId` text PRIMARY KEY NOT NULL, `builtin` text, `title` text, `instruction` text, `model` text DEFAULT '' NOT NULL, `schedule` text NOT NULL, `enabled` integer DEFAULT true NOT NULL, `nextRunAt` integer, `lastRunAt` integer, `lastSessionUuid` text, `createdAt` integer NOT NULL, `updatedAt` integer NOT NULL)",
      'CREATE INDEX IF NOT EXISTS `ai-templates-next-idx` ON `ai-templates` (`nextRunAt`)',
      "CREATE TABLE IF NOT EXISTS `ai-template-marks` (`templateId` text NOT NULL, `entityType` text NOT NULL, `entityId` text NOT NULL, `fingerprint` text NOT NULL, `blocks` text DEFAULT '[]' NOT NULL, `at` integer NOT NULL, PRIMARY KEY(`templateId`, `entityType`, `entityId`))",
    ])
      rawDb.prepare(statement).run();
  },
});
