import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import aiTemplateCoverage from '../../update/migrations/0.0.6-ai-template-coverage';
import aiTemplatesEverywhere from '../../update/migrations/0.0.6-ai-templates-everywhere';

let rawDb: Database.Database | undefined;
afterEach(() => rawDb?.close());

/** The template tables as 0.0.6/009 and 011 left them, with a message. */
function scheduledDb() {
  rawDb = new Database(':memory:');
  rawDb.exec(`
    CREATE TABLE \`ai-templates\` (\`templateId\` text PRIMARY KEY NOT NULL, \`builtin\` text, \`title\` text, \`instruction\` text, \`model\` text DEFAULT '' NOT NULL, \`schedule\` text NOT NULL, \`enabled\` integer DEFAULT true NOT NULL, \`nextRunAt\` integer, \`lastRunAt\` integer, \`lastSessionUuid\` text, \`createdAt\` integer NOT NULL, \`updatedAt\` integer NOT NULL, \`offerOn\` text DEFAULT '[]' NOT NULL);
    CREATE INDEX \`ai-templates-next-idx\` ON \`ai-templates\` (\`nextRunAt\`);
    CREATE TABLE \`ai-template-marks\` (\`templateId\` text NOT NULL, \`entityType\` text NOT NULL, \`entityId\` text NOT NULL, \`fingerprint\` text NOT NULL, \`blocks\` text DEFAULT '[]' NOT NULL, \`at\` integer NOT NULL, PRIMARY KEY(\`templateId\`, \`entityType\`, \`entityId\`));
    CREATE TABLE \`ai-messages\` (\`messageUuid\` text PRIMARY KEY NOT NULL, \`parts\` text DEFAULT '[]' NOT NULL);
  `);
  const template = rawDb.prepare(
    "INSERT INTO `ai-templates` (templateId, builtin, model, schedule, enabled, nextRunAt, lastRunAt, lastSessionUuid, createdAt, updatedAt) VALUES (?, ?, '', ?, 1, 5, 4, 'ais-1', 1, 2)",
  );
  const week = JSON.stringify({ kind: 'week', day: 1, time: '03:00' });
  template.run('builtin-nightly', 'nightly', week);
  template.run('builtin-links', 'links', week);
  template.run('builtin-graph', 'graph', week);
  template.run('at-own', null, JSON.stringify({ kind: 'manual' }));
  rawDb
    .prepare(
      "INSERT INTO `ai-template-marks` VALUES ('builtin-graph', 'project', 'p-1', 'f', '[]', 3)",
    )
    .run();
  const message = rawDb.prepare(
    'INSERT INTO `ai-messages` (messageUuid, parts) VALUES (?, ?)',
  );
  message.run(
    'm-1',
    JSON.stringify([
      {
        type: 'template',
        templateId: 'builtin-links',
        by: 'schedule',
        since: 3,
      },
    ]),
  );
  message.run(
    'm-2',
    JSON.stringify([{ type: 'notice', kind: 'stopped', text: 'the template' }]),
  );
  return rawDb;
}

describe('0.0.6/014: templates become checks', () => {
  it('drops the schedule, the marks and the built-ins that only ran on one', () => {
    const db = scheduledDb();
    // As 011 left every template: offered on every kind with a text.
    db.prepare('UPDATE `ai-templates` SET offerOn = ?').run(
      '["project","project-section","event","diary-entry","page"]',
    );
    aiTemplateCoverage.up!({ rawDb: db } as never);
    expect(
      db
        .prepare(
          'SELECT templateId, lastSessionUuid, offerOn FROM `ai-templates` ORDER BY templateId',
        )
        .all(),
    ).toEqual([
      {
        templateId: 'at-own',
        lastSessionUuid: 'ais-1',
        offerOn: '["project","project-section","event","diary-entry","page"]',
      },
      {
        templateId: 'builtin-graph',
        lastSessionUuid: 'ais-1',
        offerOn: '["project","event","diary-entry"]',
      },
      {
        templateId: 'builtin-links',
        lastSessionUuid: 'ais-1',
        offerOn: '["project","project-section","event","diary-entry","page"]',
      },
    ]);
    const columns = (
      db.pragma("table_info('ai-templates')") as { name: string }[]
    ).map((column) => column.name);
    for (const gone of ['schedule', 'enabled', 'nextRunAt', 'lastRunAt'])
      expect(columns).not.toContain(gone);
    const tables = (
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all() as { name: string }[]
    ).map((row) => row.name);
    expect(tables).toEqual(
      expect.arrayContaining(['ai-template-coverage', 'ai-template-batches']),
    );
    expect(tables).not.toContain('ai-template-marks');
  });

  it('names only the template in a run’s opening part', () => {
    const db = scheduledDb();
    aiTemplateCoverage.up!({ rawDb: db } as never);
    const parts = (messageUuid: string) =>
      JSON.parse(
        (
          db
            .prepare('SELECT parts FROM `ai-messages` WHERE messageUuid = ?')
            .get(messageUuid) as { parts: string }
        ).parts,
      );
    expect(parts('m-1')).toEqual([
      { type: 'template', templateId: 'builtin-links' },
    ]);
    expect(parts('m-2')).toEqual([
      { type: 'notice', kind: 'stopped', text: 'the template' },
    ]);
  });
});

describe('0.0.6/015: templates offered everywhere', () => {
  it('lets go of where a template was offered', () => {
    const db = scheduledDb();
    aiTemplateCoverage.up!({ rawDb: db } as never);
    aiTemplatesEverywhere.up!({ rawDb: db } as never);
    const columns = (
      db.pragma("table_info('ai-templates')") as { name: string }[]
    ).map((column) => column.name);
    expect(columns).not.toContain('offerOn');
    expect(
      db.prepare('SELECT count(*) AS count FROM `ai-templates`').get(),
    ).toEqual({ count: 3 });
  });
});
