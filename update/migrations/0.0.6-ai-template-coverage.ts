import { defineMigration } from './types';

/**
 * Templates no longer run on a schedule: the built-in ones are checks the
 * owner runs — proofreading, mending links, finding relations — and the code
 * keeps count of what each has looked at, so a run goes over only what is
 * new or changed since. The four built-in templates that only made sense on
 * a schedule go, with the schedule, the switch and the times of runs.
 * Relations are looked for only among projects, events and diary entries,
 * so that check is offered on those alone: 011 had offered every template
 * on every kind with a text.
 *
 * What the scheduled runs kept of what they read is let go rather than
 * carried over: it was kept against the entity's version, which a relation
 * moves too, while a check keeps what it looked at against what it reads —
 * no mark could ever match. The runs' sessions say only which template they
 * came from now.
 */
export default defineMigration({
  id: '0.0.6/014-ai-template-coverage',
  version: '0.0.6',
  title: {
    en: 'Turn AI templates into checks',
    ru: 'Шаблоны ИИ становятся проверками',
  },
  description: {
    en: 'No schedules: built-in checks keep count of what they have looked at.',
    ru: 'Без расписаний: встроенные проверки помнят, что уже проверили.',
  },
  up({ rawDb }) {
    for (const statement of [
      "CREATE TABLE IF NOT EXISTS `ai-template-coverage` (`templateId` text NOT NULL, `subject` text NOT NULL, `entityType` text, `entityId` text, `fingerprint` text NOT NULL, `parts` text DEFAULT '[]' NOT NULL, `at` integer NOT NULL, PRIMARY KEY(`templateId`, `subject`))",
      'CREATE INDEX IF NOT EXISTS `ai-template-coverage-entity-idx` ON `ai-template-coverage` (`entityType`,`entityId`)',
      "CREATE TABLE IF NOT EXISTS `ai-template-batches` (`sessionUuid` text NOT NULL, `templateId` text NOT NULL, `subject` text NOT NULL, `entityType` text, `entityId` text, `fingerprint` text NOT NULL, `parts` text DEFAULT '[]' NOT NULL, PRIMARY KEY(`sessionUuid`, `subject`))",
      'CREATE INDEX IF NOT EXISTS `ai-template-batches-template-idx` ON `ai-template-batches` (`templateId`)',
      'CREATE INDEX IF NOT EXISTS `ai-template-batches-entity-idx` ON `ai-template-batches` (`entityType`,`entityId`)',
      'DROP TABLE IF EXISTS `ai-template-marks`',
      "DELETE FROM `ai-templates` WHERE `templateId` IN ('builtin-diary-week', 'builtin-nightly', 'builtin-tags', 'builtin-year-ago')",
      'UPDATE `ai-templates` SET `offerOn` = \'["project","event","diary-entry"]\' WHERE `templateId` = \'builtin-graph\'',
      'DROP INDEX IF EXISTS `ai-templates-next-idx`',
      'ALTER TABLE `ai-templates` DROP COLUMN `schedule`',
      'ALTER TABLE `ai-templates` DROP COLUMN `enabled`',
      'ALTER TABLE `ai-templates` DROP COLUMN `nextRunAt`',
      'ALTER TABLE `ai-templates` DROP COLUMN `lastRunAt`',
    ])
      rawDb.prepare(statement).run();

    // A run's opening part said who started it and when the template ran
    // before; now it names the template alone.
    const update = rawDb.prepare(
      'UPDATE `ai-messages` SET `parts` = ? WHERE `messageUuid` = ?',
    );
    const rows = rawDb
      .prepare(
        'SELECT `messageUuid`, `parts` FROM `ai-messages` WHERE `parts` LIKE \'%"template"%\'',
      )
      .all() as { messageUuid: string; parts: string }[];
    for (const row of rows) {
      let parts: unknown;
      try {
        parts = JSON.parse(row.parts);
      } catch {
        continue;
      }
      if (!Array.isArray(parts)) continue;
      let changed = false;
      const next = parts.map((part: Record<string, unknown>) => {
        if (part?.type !== 'template' || !('by' in part || 'since' in part))
          return part;
        changed = true;
        return { type: 'template', templateId: part.templateId };
      });
      if (changed) update.run(JSON.stringify(next), row.messageUuid);
    }
  },
});
