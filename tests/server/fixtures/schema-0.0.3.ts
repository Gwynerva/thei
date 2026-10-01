// The schema Thei 0.0.3 created, frozen from
// `git show v0.0.3:update/migrations/0.0.1-baseline.ts`. Every released
// version keeps a file like this, so the upgrade from it stays tested.
export const schema_0_0_3: string[] = [
  `CREATE TABLE \`profiles\` (
	\`profileId\` text PRIMARY KEY NOT NULL,
	\`displayName\` text NOT NULL,
	\`slogan\` text DEFAULT '' NOT NULL,
	\`nickname\` text DEFAULT '' NOT NULL,
	\`birthDate\` text DEFAULT '' NOT NULL,
	\`currentAvatarId\` text,
	\`bannerAssetUuid\` text,
	\`faviconAssetUuid\` text,
	\`facts\` text DEFAULT '[]' NOT NULL
);
`,
  `CREATE TABLE \`profile-avatars\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`assetUuid\` text NOT NULL,
	\`createdAt\` integer NOT NULL
);
`,
  `CREATE INDEX \`profile-avatars-date-idx\` ON \`profile-avatars\` (\`createdAt\`,\`id\`);`,
  `CREATE TABLE \`profile-pinned-pages\` (
	\`pageUuid\` text PRIMARY KEY NOT NULL,
	\`sortOrder\` integer NOT NULL,
	FOREIGN KEY (\`pageUuid\`) REFERENCES \`pages\`(\`pageUuid\`) ON UPDATE no action ON DELETE cascade
);
`,
  `CREATE TABLE \`profile-external-links\` (
	\`url\` text PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL,
	\`isPrivate\` integer DEFAULT false NOT NULL,
	\`sortOrder\` integer NOT NULL,
	\`note\` text DEFAULT '' NOT NULL
);
`,
  `CREATE TABLE \`statuses\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`ownerType\` text NOT NULL,
	\`ownerId\` text NOT NULL,
	\`kind\` text DEFAULT 'regular' NOT NULL,
	\`assetUuid\` text,
	\`text\` text NOT NULL,
	\`createdAt\` integer NOT NULL,
	\`date\` text DEFAULT '' NOT NULL
);
`,
  `CREATE INDEX \`statuses-owner-date-idx\` ON \`statuses\` (\`ownerType\`,\`ownerId\`,\`date\`,\`createdAt\`,\`id\`);`,
  `CREATE TABLE \`assets\` (
	\`assetUuid\` text PRIMARY KEY NOT NULL,
	\`slug\` text NOT NULL,
	\`extension\` text NOT NULL,
	\`familyUuid\` text NOT NULL,
	\`contentHash\` text NOT NULL,
	\`settingsKey\` text NOT NULL,
	\`settings\` text,
	\`type\` text NOT NULL,
	\`size\` integer NOT NULL,
	\`touchedAt\` integer NOT NULL,
	\`meta\` text
);
`,
  `CREATE UNIQUE INDEX \`assets_slug_unique\` ON \`assets\` (\`slug\`);`,
  `CREATE UNIQUE INDEX \`assets_family_content_settings_idx\` ON \`assets\` (\`familyUuid\`,\`contentHash\`,\`settingsKey\`);`,
  `CREATE INDEX \`assets_family_idx\` ON \`assets\` (\`familyUuid\`);`,
  `CREATE INDEX \`assets_content_hash_idx\` ON \`assets\` (\`contentHash\`);`,
  `CREATE TABLE \`asset-usages\` (
	\`assetUuid\` text NOT NULL,
	\`containerType\` text NOT NULL,
	\`containerId\` text NOT NULL,
	\`role\` text NOT NULL,
	\`meta\` text,
	PRIMARY KEY(\`assetUuid\`, \`containerType\`, \`containerId\`, \`role\`)
);
`,
  `CREATE INDEX \`asset-usages-container-idx\` ON \`asset-usages\` (\`containerType\`,\`containerId\`);`,
  `CREATE INDEX \`asset-usages-asset-idx\` ON \`asset-usages\` (\`assetUuid\`);`,
  `CREATE TABLE \`backups\` (
	\`backupUuid\` text PRIMARY KEY NOT NULL,
	\`kind\` text NOT NULL,
	\`startedAt\` integer NOT NULL,
	\`completedAt\` integer NOT NULL,
	\`fileCount\` integer NOT NULL,
	\`byteCount\` integer NOT NULL,
	\`clientLabel\` text
);
`,
  `CREATE INDEX \`backups-completed-idx\` ON \`backups\` (\`completedAt\`);`,
  `CREATE TABLE \`content\` (
	\`contentUuid\` text PRIMARY KEY NOT NULL,
	\`ownerType\` text NOT NULL,
	\`ownerId\` text NOT NULL,
	\`slot\` text NOT NULL,
	\`data\` text NOT NULL,
	\`blockCount\` integer DEFAULT 0 NOT NULL,
	\`assetCount\` integer DEFAULT 0 NOT NULL,
	\`assetTotalSize\` integer DEFAULT 0 NOT NULL,
	\`createdAt\` integer NOT NULL,
	\`updatedAt\` integer NOT NULL
);
`,
  `CREATE UNIQUE INDEX \`content-owner-slot-idx\` ON \`content\` (\`ownerType\`,\`ownerId\`,\`slot\`);`,
  `CREATE INDEX \`content-owner-idx\` ON \`content\` (\`ownerType\`,\`ownerId\`);`,
  `CREATE TABLE \`content-history\` (
	\`id\` text PRIMARY KEY NOT NULL,
	\`ownerType\` text NOT NULL,
	\`ownerRef\` text NOT NULL,
	\`slot\` text NOT NULL,
	\`kind\` text NOT NULL,
	\`reason\` text,
	\`data\` text NOT NULL,
	\`digest\` text NOT NULL,
	\`wordCount\` integer NOT NULL,
	\`blockCount\` integer NOT NULL,
	\`assetCount\` integer NOT NULL,
	\`size\` integer NOT NULL,
	\`assetUuids\` text NOT NULL,
	\`writer\` text DEFAULT '' NOT NULL,
	\`createdAt\` integer NOT NULL,
	\`updatedAt\` integer NOT NULL
);
`,
  `CREATE INDEX \`content-history-field-idx\` ON \`content-history\` (\`ownerType\`,\`ownerRef\`,\`slot\`,\`kind\`,\`createdAt\`);`,
  `CREATE INDEX \`content-history-kind-idx\` ON \`content-history\` (\`kind\`,\`createdAt\`);`,
  `CREATE TABLE \`events\` (
	\`eventUuid\` text PRIMARY KEY NOT NULL,
	\`title\` text NOT NULL,
	\`summary\` text NOT NULL,
	\`access\` text NOT NULL,
	\`humanReadableSlug\` text NOT NULL,
	\`publicId\` text NOT NULL,
	\`action\` text,
	\`reminder\` text DEFAULT '' NOT NULL,
	\`createdAt\` integer NOT NULL,
	\`updatedAt\` integer NOT NULL
);
`,
  `CREATE UNIQUE INDEX \`events_publicId_unique\` ON \`events\` (\`publicId\`);`,
  `CREATE TABLE \`diary-entries\` (
	\`diaryUuid\` text PRIMARY KEY NOT NULL,
	\`date\` text NOT NULL,
	\`access\` text NOT NULL,
	\`reminder\` text DEFAULT '' NOT NULL,
	\`createdAt\` integer NOT NULL,
	\`updatedAt\` integer NOT NULL
);
`,
  `CREATE UNIQUE INDEX \`diary-entries-date-idx\` ON \`diary-entries\` (\`date\`);`,
  `CREATE TABLE \`projects\` (
	\`projectUuid\` text PRIMARY KEY NOT NULL,
	\`title\` text NOT NULL,
	\`summary\` text NOT NULL,
	\`access\` text NOT NULL,
	\`humanReadableSlug\` text NOT NULL,
	\`publicId\` text NOT NULL,
	\`showcase\` integer DEFAULT false NOT NULL,
	\`cv\` integer DEFAULT false NOT NULL,
	\`action\` text,
	\`reminder\` text DEFAULT '' NOT NULL,
	\`createdAt\` integer NOT NULL,
	\`updatedAt\` integer NOT NULL
);
`,
  `CREATE UNIQUE INDEX \`projects_publicId_unique\` ON \`projects\` (\`publicId\`);`,
  `CREATE TABLE \`pages\` (
	\`pageUuid\` text PRIMARY KEY NOT NULL,
	\`slug\` text NOT NULL,
	\`title\` text NOT NULL,
	\`summary\` text NOT NULL,
	\`access\` text NOT NULL,
	\`reminder\` text DEFAULT '' NOT NULL,
	\`createdAt\` integer NOT NULL,
	\`updatedAt\` integer NOT NULL
);
`,
  `CREATE UNIQUE INDEX \`pages_slug_unique\` ON \`pages\` (\`slug\`);`,
  `CREATE TABLE \`admin-sessions\` (
	\`sessionUuid\` text PRIMARY KEY NOT NULL,
	\`data\` text NOT NULL
);
`,
  `CREATE TABLE \`sign-in-links\` (
	\`tokenHash\` text PRIMARY KEY NOT NULL,
	\`createdAt\` integer NOT NULL,
	\`expiresAt\` integer NOT NULL,
	\`createdFrom\` text
);
`,
  `CREATE INDEX \`sign-in-links-expires-idx\` ON \`sign-in-links\` (\`expiresAt\`);`,
  `CREATE TABLE \`share-links\` (
	\`shareUuid\` text PRIMARY KEY NOT NULL,
	\`token\` text NOT NULL,
	\`entityType\` text NOT NULL,
	\`entityUuid\` text NOT NULL,
	\`label\` text DEFAULT '' NOT NULL,
	\`createdAt\` integer NOT NULL,
	\`extendedAt\` integer,
	\`expiresAt\` integer NOT NULL
);
`,
  `CREATE UNIQUE INDEX \`share-links_token_unique\` ON \`share-links\` (\`token\`);`,
  `CREATE INDEX \`share-links-entity-idx\` ON \`share-links\` (\`entityType\`,\`entityUuid\`);`,
  `CREATE INDEX \`share-links-expires-idx\` ON \`share-links\` (\`expiresAt\`);`,
  `CREATE TABLE \`project-content-sections\` (
	\`sectionUuid\` text PRIMARY KEY NOT NULL,
	\`projectUuid\` text NOT NULL,
	\`title\` text NOT NULL,
	\`summary\` text DEFAULT '' NOT NULL,
	\`humanReadableSlug\` text NOT NULL,
	\`publicId\` text NOT NULL,
	\`isPrivate\` integer DEFAULT false NOT NULL,
	\`sortOrder\` integer NOT NULL,
	\`createdAt\` integer NOT NULL,
	\`updatedAt\` integer NOT NULL
);
`,
  `CREATE INDEX \`project-content-sections-project-idx\` ON \`project-content-sections\` (\`projectUuid\`,\`sortOrder\`);`,
  `CREATE UNIQUE INDEX \`project-content-sections-public-id-unique\` ON \`project-content-sections\` (\`publicId\`);`,
  `CREATE TABLE \`project-stages\` (
	\`stageUuid\` text PRIMARY KEY NOT NULL,
	\`projectUuid\` text NOT NULL,
	\`title\` text NOT NULL,
	\`summary\` text DEFAULT '' NOT NULL,
	\`humanReadableSlug\` text NOT NULL,
	\`publicId\` text NOT NULL,
	\`isPrivate\` integer DEFAULT false NOT NULL,
	\`createdAt\` integer NOT NULL,
	\`updatedAt\` integer NOT NULL
);
`,
  `CREATE INDEX \`project-stages-project-idx\` ON \`project-stages\` (\`projectUuid\`);`,
  `CREATE UNIQUE INDEX \`project-stages-public-id-unique\` ON \`project-stages\` (\`publicId\`);`,
  `CREATE TABLE \`stage-periods\` (
	\`stageType\` text NOT NULL,
	\`stageUuid\` text NOT NULL,
	\`sortOrder\` integer NOT NULL,
	\`startDate\` text NOT NULL,
	\`endDate\` text NOT NULL,
	\`precision\` text DEFAULT 'exact' NOT NULL,
	\`precisionNote\` text DEFAULT '' NOT NULL,
	PRIMARY KEY(\`stageType\`, \`stageUuid\`, \`sortOrder\`),
	CONSTRAINT "stage-periods-stage-type-check" CHECK("stage-periods"."stageType" in ('project-stage', 'event-stage'))
);
`,
  `CREATE TABLE \`entity-relations\` (
	\`firstType\` text NOT NULL,
	\`firstId\` text NOT NULL,
	\`secondType\` text NOT NULL,
	\`secondId\` text NOT NULL,
	\`type\` text NOT NULL,
	\`note\` text,
	\`firstSortOrder\` integer NOT NULL,
	\`secondSortOrder\` integer NOT NULL,
	PRIMARY KEY(\`firstType\`, \`firstId\`, \`secondType\`, \`secondId\`)
);
`,
  `CREATE INDEX \`entity-relations-first-idx\` ON \`entity-relations\` (\`firstType\`,\`firstId\`,\`firstSortOrder\`);`,
  `CREATE INDEX \`entity-relations-second-idx\` ON \`entity-relations\` (\`secondType\`,\`secondId\`,\`secondSortOrder\`);`,
  `CREATE TABLE \`tags\` (
	\`tagUuid\` text PRIMARY KEY NOT NULL,
	\`title\` text NOT NULL,
	\`normalizedTitle\` text NOT NULL,
	\`slug\` text NOT NULL,
	\`publicId\` text NOT NULL,
	\`description\` text DEFAULT '' NOT NULL,
	\`synonyms\` text DEFAULT '[]' NOT NULL
);
`,
  `CREATE UNIQUE INDEX \`tags_normalizedTitle_unique\` ON \`tags\` (\`normalizedTitle\`);`,
  `CREATE UNIQUE INDEX \`tags_slug_unique\` ON \`tags\` (\`slug\`);`,
  `CREATE UNIQUE INDEX \`tags_publicId_unique\` ON \`tags\` (\`publicId\`);`,
  `CREATE TABLE \`tag-usages\` (
	\`tagUuid\` text NOT NULL,
	\`containerType\` text NOT NULL,
	\`containerId\` text NOT NULL,
	\`sortOrder\` integer NOT NULL,
	PRIMARY KEY(\`tagUuid\`, \`containerType\`, \`containerId\`)
);
`,
  `CREATE INDEX \`tag-usages-container-idx\` ON \`tag-usages\` (\`containerType\`,\`containerId\`);`,
  `CREATE INDEX \`tag-usages-tag-idx\` ON \`tag-usages\` (\`tagUuid\`);`,
  `CREATE TABLE \`external-links\` (
	\`url\` text PRIMARY KEY NOT NULL,
	\`title\` text,
	\`description\` text,
	\`faviconKey\` text NOT NULL,
	\`accent\` text,
	\`status\` text DEFAULT 'complete' NOT NULL,
	\`touchedAt\` integer NOT NULL
);
`,
  `CREATE TABLE \`project-external-links\` (
	\`projectUuid\` text NOT NULL,
	\`url\` text NOT NULL,
	\`sortOrder\` integer NOT NULL,
	\`isPrivate\` integer DEFAULT false NOT NULL,
	\`note\` text DEFAULT '' NOT NULL,
	PRIMARY KEY(\`projectUuid\`, \`url\`),
	FOREIGN KEY (\`projectUuid\`) REFERENCES \`projects\`(\`projectUuid\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`url\`) REFERENCES \`external-links\`(\`url\`) ON UPDATE no action ON DELETE no action
);
`,
  `CREATE INDEX \`project-external-links-project-idx\` ON \`project-external-links\` (\`projectUuid\`,\`sortOrder\`);`,
  `CREATE TABLE \`event-external-links\` (
	\`eventUuid\` text NOT NULL,
	\`url\` text NOT NULL,
	\`sortOrder\` integer NOT NULL,
	\`isPrivate\` integer DEFAULT false NOT NULL,
	\`note\` text DEFAULT '' NOT NULL,
	PRIMARY KEY(\`eventUuid\`, \`url\`),
	FOREIGN KEY (\`eventUuid\`) REFERENCES \`events\`(\`eventUuid\`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (\`url\`) REFERENCES \`external-links\`(\`url\`) ON UPDATE no action ON DELETE no action
);
`,
  `CREATE INDEX \`event-external-links-event-idx\` ON \`event-external-links\` (\`eventUuid\`,\`sortOrder\`);`,
];

/** The migrations a 0.0.3 site has recorded in its ledger. */
export const migrations_0_0_3 = [
  '0.0.1/001-baseline',
  '0.0.2/001-access-links-tokens',
  '0.0.2/002-date-precision',
  '0.0.2/003-entity-reminders',
  '0.0.2/004-statuses-owner',
  '0.0.2/005-tag-accent',
  '0.0.2/006-relations',
  '0.0.2/007-diary-entries',
  '0.0.2/008-asset-recipe-crops',
  '0.0.2/009-external-link-status',
  '0.0.2/010-tag-names',
  '0.0.2/011-config-shape',
  '0.0.3/001-status-dates',
  '0.0.3/002-content-history',
  '0.0.3/003-shared-link-favicons',
  '0.0.3/004-external-link-notes',
];
